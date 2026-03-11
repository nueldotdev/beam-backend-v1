const axios = require('axios');
const Transcript = require('../models/Transcript');
const ChatMessage = require('../models/ChatMessage');
const { resolveMeetingByKey } = require('../utils/resolveMeeting');

function buildContextFromTranscripts(transcripts) {
  return transcripts
    .map((t) => {
      const ts = t.startTime != null ? `t=${t.startTime}s` : (t.timestamp ? new Date(t.timestamp).toISOString() : '');
      return `[${ts}] ${t.speakerName}: ${t.content}`;
    })
    .join('\n');
}

async function callOpenAI({ question, context }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      answer:
        "AI is not configured on the server yet. Set OPENAI_API_KEY to enable meeting Q&A.\n\n" +
        "Meanwhile, here is the raw transcript context I have:\n\n" +
        context.slice(0, 4000),
      sources: [],
      usedModel: null,
    };
  }

  const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const resp = await axios.post(
    `${baseURL.replace(/\/$/, '')}/chat/completions`,
    {
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful meeting assistant. Answer only using the provided transcript context. ' +
            'If the answer is not in the context, say you do not know.',
        },
        {
          role: 'user',
          content: `Transcript context:\n${context}\n\nQuestion: ${question}`,
        },
      ],
      temperature: 0.2,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const answer = resp.data?.choices?.[0]?.message?.content?.trim() || 'No answer';
  return { answer, sources: [], usedModel: model };
}

const meetingAiChat = async (req, res, next) => {
  try {
    const meeting = await resolveMeetingByKey(req.params.meetingKey);
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

    const question = String(req.body.question || '').trim();
    if (!question) return res.status(400).json({ success: false, message: 'question required' });

    const transcriptLimit = Math.min(Number(req.body.transcriptLimit) || 200, 1000);
    const transcripts = await Transcript.find({ meetingId: meeting._id })
      .sort({ timestamp: -1 })
      .limit(transcriptLimit)
      .lean();

    const context = buildContextFromTranscripts(transcripts.reverse());
    const { answer, sources, usedModel } = await callOpenAI({ question, context });

    // store user question + assistant answer
    await ChatMessage.create({
      meetingId: meeting._id,
      userId: req.user?._id || undefined,
      messageType: 'user',
      content: question,
      createdAt: new Date(),
    });

    const assistant = await ChatMessage.create({
      meetingId: meeting._id,
      userId: req.user?._id || undefined,
      messageType: 'assistant',
      content: answer,
      metadata: { sources: sources || [] },
      createdAt: new Date(),
    });

    res.json({
      success: true,
      data: {
        answer,
        usedModel,
        messageId: assistant._id,
      },
    });
  } catch (e) {
    next(e);
  }
};

module.exports = { meetingAiChat };


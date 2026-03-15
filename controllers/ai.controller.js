const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const Transcript = require('../models/Transcript');
const ChatMessage = require('../models/ChatMessage');
const { resolveMeetingByKey } = require('../utils/resolveMeeting');

// AWS Configuration (Pulls from env automatically if AWS_ACCESS_KEY_ID is set)
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "us-east-1" });

function buildContextFromTranscripts(transcripts) {
  return transcripts
    .map(t => {
      const ts = t.startTime != null ? `t=${t.startTime}s` : (t.timestamp ? new Date(t.timestamp).toISOString() : '');
      return `[${ts}] ${t.speakerName}: ${t.content}`;
    })
    .join('\n');
}

async function callAmazonNova({ question, context }) {
  // Amazon Nova Models: "amazon.nova-micro-v1:0" or "amazon.nova-lite-v1:0"
  const modelId = "amazon.nova-micro-v1:0"; 

  const systemPrompt = "You are a helpful meeting assistant. Answer the user's question using ONLY the provided transcript context. If the answer is not in the context, say you do not know.";

  const payload = {
    system: [{ text: systemPrompt }],
    messages: [
      {
        role: "user",
        content: [
          { text: `Transcript context:\n${context}` },
          { text: `Question: ${question}` }
        ]
      }
    ],
    inferenceConfig: {
      max_new_tokens: 1000,
      temperature: 0.2,
    }
  };

  try {
    const command = new InvokeModelCommand({
      contentType: "application/json",
      accept: "application/json",
      modelId: modelId,
      body: JSON.stringify(payload)
    });

    const response = await bedrockClient.send(command);
    
    // AWS returns a Unit8Array, we must decode it
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const answer = responseBody.output?.message?.content?.[0]?.text || "No answer generated.";

    return { answer, usedModel: modelId };
  } catch (error) {
    console.error("Bedrock Error:", error);
    return { 
      answer: "Error reaching Amazon Nova. Please check AWS credentials and model access.", 
      usedModel: modelId 
    };
  }
}

const meetingAiChat = async (req, res, next) => {
  try {
    const meeting = await resolveMeetingByKey(req.params.meetingKey);
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

    const question = String(req.body.question || '').trim();
    if (!question) return res.status(400).json({ success: false, message: 'question required' });

    // Fetch previous transcripts for context
    const transcriptLimit = Math.min(Number(req.body.transcriptLimit) || 200, 1000);
    const transcripts = await Transcript.find({ meetingId: meeting._id })
      .sort({ timestamp: -1 })
      .limit(transcriptLimit)
      .lean();

    const context = buildContextFromTranscripts(transcripts.reverse());
    
    // Call Amazon Nova
    const { answer, usedModel } = await callAmazonNova({ question, context });

    // Store user question & AI answer in MongoDB
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
      metadata: { sources: [] },
      createdAt: new Date(),
    });

    res.json({
      success: true,
      data: { answer, usedModel, messageId: assistant._id },
    });
  } catch (e) {
    next(e);
  }
};

const generateMeetingSummary = async (req, res, next) => {
  try {
    const meeting = await resolveMeetingByKey(req.params.meetingKey);
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

    // Fetch transcripts
    const transcripts = await Transcript.find({ meetingId: meeting._id })
      .sort({ timestamp: 1 })
      .lean();

    if (transcripts.length === 0) {
      return res.json({ success: true, data: { summary: "No transcripts available for this meeting." } });
    }

    const context = buildContextFromTranscripts(transcripts);
    
    // Call Amazon Nova for summary
    const modelId = "amazon.nova-micro-v1:0"; 
    const systemPrompt = "You are a professional secretary. Summarize the following meeting transcript in a concise and professional manner. Highlight key decisions and action items.";
    
    const payload = {
      system: [{ text: systemPrompt }],
      messages: [
        {
          role: "user",
          content: [
            { text: `Transcript context:\n${context}` }
          ]
        }
      ],
      inferenceConfig: {
        max_new_tokens: 1500,
        temperature: 0.3,
      }
    };

    const command = new InvokeModelCommand({
      contentType: "application/json",
      accept: "application/json",
      modelId: modelId,
      body: JSON.stringify(payload)
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const summary = responseBody.output?.message?.content?.[0]?.text || "No summary generated.";

    res.json({
      success: true,
      data: { summary, usedModel: modelId },
    });
  } catch (e) {
    next(e);
  }
};

module.exports = { meetingAiChat, generateMeetingSummary };


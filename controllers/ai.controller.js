const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const Transcript = require('../models/Transcript');
const ChatMessage = require('../models/ChatMessage');
const Document = require('../models/Document');
const { resolveMeetingByKey } = require('../utils/resolveMeeting');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Helper to fetch file bytes from Cloudinary for multimodal processing
 */
async function fetchFileBytes(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  } catch (error) {
    console.error(`[AI] Failed to fetch file from Cloudinary: ${url}`, error.message);
    return null;
  }
}

async function runGeminiTask(systemPrompt, userParts, modelName = 'gemini-2.5-flash') {
  if (!process.env.GEMINI_API_KEY) {
    console.error("[Gemini] ERROR: GEMINI_API_KEY is missing from .env");
    throw new Error("GEMINI_API_KEY is not configured");
  }

  try {
    console.log(`[Gemini SDK] Requesting ${modelName}...`);
    const model = genAI.getGenerativeModel({ 
      model: modelName,
      systemInstruction: systemPrompt 
    });

    const result = await model.generateContent(userParts);
    const response = await result.response;
    const text = response.text();
    
    console.log(`[Gemini SDK] Success: Received ${text.length} characters.`);
    return text;
  } catch (err) {
    console.error("[Gemini SDK] CALL FAILED:", err.message);
    throw err;
  }
}

function buildContextFromTranscripts(transcripts) {
  return transcripts
    .map(t => {
      const ts = t.startTime != null ? `t=${t.startTime}s` : (t.timestamp ? new Date(t.timestamp).toISOString() : '');
      return `[${ts}] ${t.speakerName}: ${t.content}`;
    })
    .join('\n');
}

/**
 * TRIAGE: Uses Gemini to determine intent and required context
 */
async function triageUserQuery(question, availableDocs) {
  const docList = availableDocs.map(d => ({ 
    id: d._id, 
    name: d.filename, 
    type: d.fileType,
    hasExtractedText: !!(d.extractedText && d.extractedText.trim().length > 0)
  }));

  const systemPrompt = `Analyze the user's meeting-related question. Identify which resources are needed to answer it.
Available Documents: ${JSON.stringify(docList)}

RULES:
1. If a question specifically asks about a document that has NO extracted text (hasExtractedText: false), you MUST set isMultimodalRequired to true.
2. If the question asks about visual elements (charts, tables, layout), set isMultimodalRequired to true.

Return ONLY a JSON object:
{
  "needsTranscripts": boolean,
  "relevantDocIds": ["id1", "id2"],
  "isMultimodalRequired": boolean,
  "specificPages": [number]
}`;

  try {
    const resultText = await runGeminiTask(systemPrompt, [question]);
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const plan = JSON.parse(jsonMatch[0]);

    // Force multimodal if we're asking about a document with no text
    for (const docId of plan.relevantDocIds) {
      const doc = availableDocs.find(d => String(d._id) === String(docId));
      if (doc && !doc.extractedText && (doc.fileType === 'pdf' || doc.fileType === 'image')) {
        console.log(`[Triage] Forcing Multimodal: ${doc.filename} has no extracted text.`);
        plan.isMultimodalRequired = true;
      }
    }

    return plan;
  } catch (err) {
    console.error("[AI Orchestrator] Triage Failed, falling back to full context.");
    return { needsTranscripts: true, relevantDocIds: [], isMultimodalRequired: false, specificPages: [] };
  }
}

/**
 * SOLVER: Final answer generation
 */
async function solveQuery({ question, transcriptContext, documentData, isMultimodal }) {
  const systemPrompt = "You are a senior meeting assistant. Use the provided context to answer accurately.";
  const parts = [];
  
  if (transcriptContext) {
    parts.push(`MEETING TRANSCRIPT:\n${transcriptContext}`);
  }

  for (const doc of documentData) {
    if (isMultimodal && doc.bytes && (doc.type === 'image' || doc.type === 'pdf')) {
      const mimeType = doc.type === 'pdf' ? 'application/pdf' : (doc.url.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
      console.log(`[AI] Including Multimodal Content for ${doc.name} (${doc.bytes.length} bytes)`);
      parts.push(`Source Document: ${doc.name}`);
      parts.push({
        inlineData: {
          data: doc.bytes.toString('base64'),
          mimeType: mimeType
        }
      });
    } else {
      const textSnippet = doc.text ? doc.text.slice(0, 100) : "EMPTY";
      console.log(`[AI] Including Text for ${doc.name} (${doc.text?.length || 0} chars). Snippet: ${textSnippet}...`);
      parts.push(`DOCUMENT (${doc.name}):\n${doc.text || "No text content available. If you see this, use multimodal data if provided."}`);
    }
  }

  parts.push(`QUESTION: ${question}`);

  try {
    return await runGeminiTask(systemPrompt, parts);
  } catch (err) {
    return "The AI encountered an error while analyzing the context. Please check backend logs.";
  }
}

const meetingAiChat = async (req, res, next) => {
  try {
    const meeting = await resolveMeetingByKey(req.params.meetingKey);
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

    const question = String(req.body.question || '').trim();
    if (!question) return res.status(400).json({ success: false, message: 'Question required' });

    console.log(`[AI Orchestrator] Processing query for meeting: ${meeting.meetingCode}`);
    
    // FETCH FULL DOCS including extractedText for triage
    const allDocs = await Document.find({ meetingId: meeting._id, isActive: true }).lean();
    
    const plan = await triageUserQuery(question, allDocs);
    console.log("[AI Orchestrator] Plan:", JSON.stringify(plan, null, 2));

    let transcriptContext = "";
    if (plan.needsTranscripts) {
      const transcripts = await Transcript.find({ meetingId: meeting._id }).sort({ timestamp: 1 }).limit(500).lean();
      transcriptContext = buildContextFromTranscripts(transcripts);
    }

    const documentData = [];
    // If triage identified specific docs, use those. Otherwise, if the question is broad, we might need all relevant ones.
    const targetDocIds = plan.relevantDocIds.length > 0 ? plan.relevantDocIds : [];
    
    if (targetDocIds.length > 0) {
      const docs = allDocs.filter(d => targetDocIds.includes(String(d._id)));
      for (const d of docs) {
        let bytes = null;
        if (plan.isMultimodalRequired) {
          bytes = await fetchFileBytes(d.fileUrl);
        }
        documentData.push({
          id: d._id,
          name: d.filename,
          type: d.fileType,
          text: d.extractedText,
          url: d.fileUrl,
          bytes
        });
      }
    }

    const answer = await solveQuery({ 
      question, 
      transcriptContext, 
      documentData, 
      isMultimodal: plan.isMultimodalRequired 
    });

    await ChatMessage.create({ meetingId: meeting._id, messageType: 'user', content: question });
    const assistantMsg = await ChatMessage.create({ 
      meetingId: meeting._id, 
      messageType: 'assistant', 
      content: answer,
      metadata: { plan, modelUsed: "gemini-2.5-flash" }
    });

    res.json({ success: true, data: { answer, messageId: assistantMsg._id } });
  } catch (e) {
    next(e);
  }
};

const generateMeetingSummary = async (req, res, next) => {
  try {
    const meeting = await resolveMeetingByKey(req.params.meetingKey);
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

    const transcripts = await Transcript.find({ meetingId: meeting._id }).sort({ timestamp: 1 }).lean();
    const documents = await Document.find({ meetingId: meeting._id, isActive: true }).lean();

    const transcriptContext = buildContextFromTranscripts(transcripts);
    const documentSummary = documents.map(d => `Document "${d.filename}" was shared. Highlights: ${d.extractedText?.slice(0, 500)}...`).join('\n');

    const systemPrompt = "You are a professional secretary. Summarize the meeting.";
    const userParts = [`Transcripts:\n${transcriptContext}\n\nDocuments:\n${documentSummary}`];

    const summary = await runGeminiTask(systemPrompt, userParts);
    res.json({ success: true, data: { summary } });
  } catch (e) {
    next(e);
  }
};

module.exports = { meetingAiChat, generateMeetingSummary };

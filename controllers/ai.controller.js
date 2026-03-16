const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const axios = require('axios');
const Transcript = require('../models/Transcript');
const ChatMessage = require('../models/ChatMessage');
const Document = require('../models/Document');
const { resolveMeetingByKey } = require('../utils/resolveMeeting');

const bedrockClient = new BedrockRuntimeClient({ 
  region: process.env.AWS_REGION || "eu-north-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

/**
 * Helper to fetch file bytes from Cloudinary for multimodal processing
 */
async function fetchFileBytes(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return new Uint8Array(response.data);
  } catch (error) {
    console.error(`Failed to fetch file from Cloudinary: ${url}`, error.message);
    return null;
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
 * TRIAGE: Uses Nova Micro to determine intent and required context
 */
async function triageUserQuery(question, availableDocs) {
  const modelId = "amazon.nova-micro-v1:0";
  const docList = availableDocs.map(d => ({ id: d._id, name: d.filename, type: d.fileType }));

  const systemPrompt = `Analyze the user's meeting-related question. Identify which resources are needed to answer it.
Available Documents: ${JSON.stringify(docList)}

Return ONLY a JSON object:
{
  "needsTranscripts": boolean,
  "relevantDocIds": ["id1", "id2"],
  "isMultimodalRequired": boolean (true if question asks about visual charts, tables, or layout in a document),
  "specificPages": [number]
}`;

  try {
    const payload = {
      schemaVersion: "messages-v1",
      system: [{ text: systemPrompt }],
      messages: [{ role: "user", content: [{ text: question }] }],
      inferenceConfig: { max_new_tokens: 500, temperature: 0 }
    };

    const command = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(payload)
    });

    const response = await bedrockClient.send(command);
    const body = JSON.parse(new TextDecoder().decode(response.body));
    const resultText = body.output?.message?.content?.[0]?.text || "";
    
    // Robustly extract JSON object from response
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON object found in AI response");
    }
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error("Triage Error:", err);
    return { needsTranscripts: true, relevantDocIds: [], isMultimodalRequired: false, specificPages: [] };
  }
}

/**
 * SOLVER: Final answer generation
 */
async function solveQuery({ question, transcriptContext, documentData, isMultimodal }) {
  // Use Nova Lite for multimodal/complex, Nova Micro for basic
  const modelId = isMultimodal ? "amazon.nova-lite-v1:0" : "amazon.nova-micro-v1:0";
  
  const systemPrompt = "You are a senior meeting assistant. Use the provided context to answer the user accurately. Cross-reference speakers and documents. If the answer isn't available, say so.";

  const content = [];
  
  if (transcriptContext) {
    content.push({ text: `MEETING TRANSCRIPT:\n${transcriptContext}` });
  }

  // Handle multimodal document data
  for (const doc of documentData) {
    if (isMultimodal && doc.bytes && (doc.type === 'image' || doc.type === 'pdf')) {
      // Nova Lite supports direct PDF/Image input
      const format = doc.type === 'pdf' ? 'pdf' : (doc.url.endsWith('.png') ? 'png' : 'jpeg');
      const mediaType = doc.type === 'pdf' ? 'document' : 'image';
      
      const mediaItem = {
        format,
        source: {
          bytes: Buffer.from(doc.bytes).toString('base64')
        }
      };

      if (mediaType === 'document') {
        // Nova requires document name to be alphanumeric and 1-64 chars
        mediaItem.name = (doc.name || 'SourceDocument').replace(/[^a-zA-Z0-9]/g, '').slice(0, 64) || 'Document';
      }

      content.push({
        text: `Source Document: ${doc.name}`
      });
      content.push({ [mediaType]: mediaItem });
    } else {
      content.push({ text: `DOCUMENT CONTENT (${doc.name}):\n${doc.text}` });
    }
  }

  content.push({ text: `USER QUESTION: ${question}` });

  const payload = {
    schemaVersion: "messages-v1",
    system: [{ text: systemPrompt }],
    messages: [{ role: "user", content }],
    inferenceConfig: { max_new_tokens: 2000, temperature: 0.1 }
  };

  try {
    const command = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(payload)
    });

    const response = await bedrockClient.send(command);
    const body = JSON.parse(new TextDecoder().decode(response.body));
    return body.output?.message?.content?.[0]?.text || "No response generated.";
  } catch (err) {
    console.error("Solver Error:", err);
    return "The AI encountered an error while analyzing the context. Please try again.";
  }
}

const meetingAiChat = async (req, res, next) => {
  try {
    const meeting = await resolveMeetingByKey(req.params.meetingKey);
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

    const question = String(req.body.question || '').trim();
    if (!question) return res.status(400).json({ success: false, message: 'Question required' });

    // Step 1: Fetch metadata for triage
    const allDocs = await Document.find({ meetingId: meeting._id, isActive: true }).select('_id filename fileType').lean();
    
    // Step 2: Triage
    const plan = await triageUserQuery(question, allDocs);
    console.log("[AI Orchestrator] Plan:", plan);

    // Step 3: Gather context based on plan
    let transcriptContext = "";
    if (plan.needsTranscripts) {
      const transcripts = await Transcript.find({ meetingId: meeting._id }).sort({ timestamp: 1 }).limit(500).lean();
      transcriptContext = buildContextFromTranscripts(transcripts);
    }

    const documentData = [];
    if (plan.relevantDocIds.length > 0) {
      const docs = await Document.find({ _id: { $in: plan.relevantDocIds } }).lean();
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
          bytes: bytes
        });
      }
    }

    // Step 4: Generate Answer
    const answer = await solveQuery({ 
      question, 
      transcriptContext, 
      documentData, 
      isMultimodal: plan.isMultimodalRequired 
    });

    // Save to history
    await ChatMessage.create({ meetingId: meeting._id, messageType: 'user', content: question });
    const assistantMsg = await ChatMessage.create({ 
      meetingId: meeting._id, 
      messageType: 'assistant', 
      content: answer,
      metadata: { plan, modelUsed: plan.isMultimodalRequired ? "nova-lite" : "nova-micro" }
    });

    res.json({ success: true, data: { answer, messageId: assistantMsg._id } });
  } catch (e) {
    next(e);
  }
};

/**
 * Summary remains optimized but can use documents if triage suggests they are relevant
 */
const generateMeetingSummary = async (req, res, next) => {
  try {
    const meeting = await resolveMeetingByKey(req.params.meetingKey);
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });

    const transcripts = await Transcript.find({ meetingId: meeting._id }).sort({ timestamp: 1 }).lean();
    const documents = await Document.find({ meetingId: meeting._id, isActive: true }).lean();

    const transcriptContext = buildContextFromTranscripts(transcripts);
    const documentSummary = documents.map(d => `Document "${d.filename}" was shared. Highlights: ${d.extractedText?.slice(0, 500)}...`).join('\n');

    const modelId = "amazon.nova-micro-v1:0"; 
    const payload = {
      schemaVersion: "messages-v1",
      system: [{ text: "You are a professional secretary. Summarize the meeting transcript and shared documents into a concise report." }],
      messages: [{ role: "user", content: [{ text: `Transcripts:\n${transcriptContext}\n\nDocuments Shared:\n${documentSummary}` }] }],
      inferenceConfig: { max_new_tokens: 1500, temperature: 0.3 }
    };

    const command = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(payload)
    });

    const response = await bedrockClient.send(command);
    const body = JSON.parse(new TextDecoder().decode(response.body));
    const summary = body.output?.message?.content?.[0]?.text || "No summary generated.";

    res.json({ success: true, data: { summary } });
  } catch (e) {
    next(e);
  }
};

module.exports = { meetingAiChat, generateMeetingSummary };

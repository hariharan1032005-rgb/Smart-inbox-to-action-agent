import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Lazy initializer for Gemini SDK
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is missing. Please configure it in the Settings > Secrets panel.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Helper function to generate heuristic analysis results if Gemini API fails or is offline
function getLocalFallbackAnalysis(email: any, errorMessage: string) {
  const { subject, sender, body } = email;
  const contentLower = `${subject} ${body}`.toLowerCase();
  
  let action_needed = true;
  let category = "NONE";
  let priority_score = 1;
  let urgency_reason = "Evaluated via intelligent rule-based heuristic backup engine.";
  let tool_name: string | null = null;
  let tool_args: any = {};
  let one_line_summary = "";

  // simple heuristic checks
  if (contentLower.includes("newsletter") || contentLower.includes("subscribe") || contentLower.includes("promotional") || contentLower.includes("no-reply") || contentLower.includes("digest")) {
    action_needed = false;
    category = "NONE";
    priority_score = 1;
    urgency_reason = "Identified as promotional, newsletter, or notification content.";
    one_line_summary = `[Priority 1] (Backup Heuristic) Informational email from ${sender.replace(/<.*>/, "")}.`;
  } else if (contentLower.includes("meeting") || contentLower.includes("calendar") || contentLower.includes("zoom") || contentLower.includes("call") || contentLower.includes("schedule") || contentLower.includes("invite")) {
    category = "MEETING_REQUEST";
    priority_score = contentLower.includes("urgent") || contentLower.includes("today") || contentLower.includes("tomorrow") ? 4 : 3;
    urgency_reason = "Detected calendar invitation or schedule request keywords.";
    tool_name = "create_reminder";
    tool_args = {
      title: `Meeting/Call request: ${subject}`,
      suggested_time: "Tomorrow (detected from email content)",
      notes: `Organizer: ${sender}. Automatically processed via smart local rule backup.`,
      priority_score,
    };
    one_line_summary = `[Priority ${priority_score}] (Backup Heuristic) Calendar reminder logged for: "${subject}"`;
  } else if (contentLower.includes("due") || contentLower.includes("deadline") || contentLower.includes("by friday") || contentLower.includes("by monday") || contentLower.includes("submit") || contentLower.includes("task") || contentLower.includes("todo")) {
    category = "DEADLINE_TASK";
    priority_score = contentLower.includes("urgent") || contentLower.includes("immediately") || contentLower.includes("asap") ? 5 : 4;
    urgency_reason = "Detected action item, submission task, or deadline keywords.";
    tool_name = "log_task";
    tool_args = {
      task_description: `Deadline task from ${sender.replace(/<.*>/, "")}: ${subject}`,
      deadline: contentLower.includes("friday") ? "Friday" : contentLower.includes("tomorrow") ? "Tomorrow" : "not specified",
      priority_score,
    };
    one_line_summary = `[Priority ${priority_score}] (Backup Heuristic) Logged deadline task: "${subject}"`;
  } else if (contentLower.includes("approve") || contentLower.includes("sign off") || contentLower.includes("review") || contentLower.includes("approval")) {
    category = "APPROVAL_NEEDED";
    priority_score = 4;
    urgency_reason = "Detected review or approval request keywords.";
    tool_name = "log_task";
    tool_args = {
      task_description: `Approval/Sign-off required for: ${subject}`,
      deadline: "ASAP",
      priority_score,
    };
    one_line_summary = `[Priority 4] (Backup Heuristic) Approval task logged for: "${subject}"`;
  } else {
    // Reply needed as fallback
    category = "REPLY_NEEDED";
    priority_score = contentLower.includes("urgent") ? 4 : 3;
    urgency_reason = "Direct email query or conversation detected; reply draft generated.";
    tool_name = "draft_reply";
    tool_args = {
      email_summary: `Direct email regarding "${subject}"`,
      suggested_reply: `Hi,\n\nThank you for reaching out. I received your message about "${subject}" and wanted to let you know I'm looking into it. I will get back to you with a detailed update shortly.\n\nBest regards,\n[Your Name]`,
      priority_score,
    };
    one_line_summary = `[Priority ${priority_score}] (Backup Heuristic) Reply drafted for query from ${sender.replace(/<.*>/, "")}.`;
  }

  return {
    step1: { action_needed, reason: urgency_reason },
    step2: { category },
    step3: { priority_score, urgency_reason },
    step4: { tool_name, tool_args },
    step5: { one_line_summary: `⚡ ${one_line_summary} (Rule-Based Backup Mode)` }
  };
}

// Global cache to bypass known exhausted/failing models for 5 minutes to keep UI super fast and responsive
let gemini35ExhaustedUntil = 0;
let geminiLiteExhaustedUntil = 0;

// Helper to query Gemini with retry support
async function queryGeminiWithRetry(ai: any, modelName: string, contents: string, config: any, maxRetries = 2, delayMs = 800): Promise<string> {
  let attempt = 0;
  while (true) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config,
      });
      const text = response.text;
      if (!text) {
        throw new Error("Empty text response from model");
      }
      return text;
    } catch (error: any) {
      attempt++;
      const errorStr = String(error.message || error);
      
      // If quota exceeded or resources exhausted, do NOT waste time retrying since it's a hard limit
      const isQuotaExceeded = errorStr.toLowerCase().includes("quota") || 
                              errorStr.toLowerCase().includes("limit") || 
                              errorStr.toLowerCase().includes("exceeded") ||
                              errorStr.toLowerCase().includes("resource_exhausted") ||
                              error.status === 429;

      const isTransient = (error.status === 503 || error.status === 429 || 
                          errorStr.includes("503") || errorStr.includes("429") ||
                          errorStr.includes("UNAVAILABLE") || errorStr.includes("RESOURCE_EXHAUSTED"))
                          && !isQuotaExceeded;
      
      console.warn(`[Gemini Attempt ${attempt}/${maxRetries + 1} failed for ${modelName}]:`, error.message || error);
      
      if (attempt <= maxRetries && isTransient) {
        const nextDelay = delayMs * Math.pow(2, attempt - 1);
        console.log(`Retrying in ${nextDelay}ms due to transient error...`);
        await new Promise((resolve) => setTimeout(resolve, nextDelay));
        continue;
      }
      throw error;
    }
  }
}

// REST API endpoint to analyze a single or batch of emails
app.post("/api/analyze", async (req, res) => {
  try {
    const { emails } = req.body;
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: "Invalid request: 'emails' array is required." });
    }

    const ai = getGeminiClient();
    const results = [];

    const schema = {
      type: Type.OBJECT,
      required: ["step1", "step2", "step3", "step4", "step5"],
      properties: {
        step1: {
          type: Type.OBJECT,
          required: ["action_needed", "reason"],
          properties: {
            action_needed: { type: Type.BOOLEAN },
            reason: { type: Type.STRING },
          },
        },
        step2: {
          type: Type.OBJECT,
          required: ["category"],
          properties: {
            category: { type: Type.STRING }, // REPLY_NEEDED, MEETING_REQUEST, DEADLINE_TASK, APPROVAL_NEEDED, NONE
          },
        },
        step3: {
          type: Type.OBJECT,
          required: ["priority_score", "urgency_reason"],
          properties: {
            priority_score: { type: Type.INTEGER },
            urgency_reason: { type: Type.STRING },
          },
        },
        step4: {
          type: Type.OBJECT,
          required: ["tool_name", "tool_args"],
          properties: {
            tool_name: { type: Type.STRING }, // draft_reply, create_reminder, log_task, null
            tool_args: {
              type: Type.OBJECT,
              properties: {
                email_summary: { type: Type.STRING },
                suggested_reply: { type: Type.STRING },
                title: { type: Type.STRING },
                suggested_time: { type: Type.STRING },
                notes: { type: Type.STRING },
                task_description: { type: Type.STRING },
                deadline: { type: Type.STRING },
                priority_score: { type: Type.INTEGER },
              },
            },
          },
        },
        step5: {
          type: Type.OBJECT,
          required: ["one_line_summary"],
          properties: {
            one_line_summary: { type: Type.STRING },
          },
        },
      },
    };

    for (const email of emails) {
      const { subject, sender, body } = email;
      if (!subject || !sender || !body) {
        results.push({
          error: "Missing required fields (subject, sender, body) for email.",
          original_email: email,
        });
        continue;
      }

      const prompt = `
You are a Smart Inbox-to-Action Agent. Analyze the following email content and strictly perform the 5-step decision process.

EMAIL CONTENT:
Sender: ${sender}
Subject: ${subject}
Body:
${body}

FOLLOW THESE STEPS IN YOUR REASONING PROCESS:

STEP 1 - Decide if action is needed:
Is action needed, or is it just informational (newsletter, FYI, notification, promotional, or social)?
- If NO action is needed, action_needed must be false, priority_score must be 1, tool_name must be null. Include a 1-line reason.

STEP 2 - Classify the action into ONE category:
- REPLY_NEEDED: the sender is asking a question or waiting for a response.
- MEETING_REQUEST: the email is proposing or asking to schedule a meeting/call.
- DEADLINE_TASK: the email contains a task with a deadline (e.g., "submit by Friday").
- APPROVAL_NEEDED: the sender is waiting for approval or sign-off.
- NONE: if no action is needed.

STEP 3 - Assign a priority_score (1 to 5) based on urgency:
- 5 = explicit urgent deadline within 24-48 hours, or words like "urgent", "ASAP", "immediately"
- 4 = deadline within a week, or clearly time-sensitive
- 3 = approval or reply needed, no explicit deadline mentioned
- 2 = meeting request, flexible timing, no urgency indicated
- 1 = no action needed

STEP 4 - Construct the simulated tool call structure based on category:
- REPLY_NEEDED -> tool_name = 'draft_reply', tool_args = { email_summary, suggested_reply, priority_score }
  (suggested_reply must be a fully written, professional draft response in plain text)
- MEETING_REQUEST -> tool_name = 'create_reminder', tool_args = { title, suggested_time, notes, priority_score }
  (suggested_time must be the time/date mentioned, or "not specified" if none. Do not guess/invent!)
- DEADLINE_TASK -> tool_name = 'log_task', tool_args = { task_description, deadline, priority_score }
  (deadline must be the date/day mentioned, or "not specified" if none. Do not guess/invent!)
- APPROVAL_NEEDED -> tool_name = 'log_task', tool_args = { task_description, deadline: 'ASAP', priority_score: 5 }

STEP 5 - Provide a one-line plain-English summary including the priority:
e.g. "[Priority 5] Deadline task — added 'Submit quarterly report' (due Friday) to to-do list."
Or "[Priority 1] No action needed — promotional newsletter."

You MUST output your response strictly conforming to the defined JSON schema. Do not make up deadlines or dates if they are not explicitly specified in the email body (write "not specified").
`;

      const now = Date.now();
      let parsed: any = null;
      let usedModel = "gemini-3.5-flash";

      const shouldTry35 = now > gemini35ExhaustedUntil;
      const shouldTryLite = now > geminiLiteExhaustedUntil;

      if (!shouldTry35 && !shouldTryLite) {
        console.info("Bypassing Gemini API completely - both models in cooldown. Using heuristic engine immediately.");
        parsed = getLocalFallbackAnalysis(email, "Both Gemini API models are temporarily in cooldown due to quota limits.");
      } else {
        if (shouldTry35) {
          try {
            // Attempt 1: Call gemini-3.5-flash
            const responseText = await queryGeminiWithRetry(ai, "gemini-3.5-flash", prompt, {
              responseMimeType: "application/json",
              responseSchema: schema,
            });
            parsed = JSON.parse(responseText.trim());
          } catch (primaryError: any) {
            console.warn("Primary model 'gemini-3.5-flash' failed/unavailable. Placing into a 5-minute cooldown cache.");
            gemini35ExhaustedUntil = Date.now() + 300000; // 5 minutes cooldown
          }
        }

        if (!parsed && shouldTryLite) {
          usedModel = "gemini-3.1-flash-lite";
          try {
            // Attempt 2: Fallback to flash-lite if flash-3.5 is completely overloaded/exhausted
            const responseText = await queryGeminiWithRetry(ai, "gemini-3.1-flash-lite", prompt, {
              responseMimeType: "application/json",
              responseSchema: schema,
            }, 1, 500);
            parsed = JSON.parse(responseText.trim());
          } catch (fallbackError: any) {
            console.error("Fallback model 'gemini-3.1-flash-lite' also failed. Placing into 5-minute cooldown cache.");
            geminiLiteExhaustedUntil = Date.now() + 300000; // 5 minutes cooldown
            const errMsg = fallbackError.message || String(fallbackError);
            parsed = getLocalFallbackAnalysis(email, errMsg);
          }
        }

        if (!parsed) {
          // Absolute backup fallback
          parsed = getLocalFallbackAnalysis(email, "Cascade failure fallback");
        }
      }

      results.push({
        id: Math.random().toString(36).substring(2, 9),
        original_email: email,
        analysis: parsed,
      });
    }

    res.json({ success: true, results });
  } catch (error: any) {
    console.error("Analysis endpoint error:", error);
    res.status(500).json({ error: error.message || "An unexpected error occurred during processing." });
  }
});

// Setup Vite Dev Server / Static Hosting Middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in development mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in production mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Smart Inbox Agent running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

import { Email } from "./types";

// Helper to decode base64url encoded strings from Gmail API
function decodeBase64Url(str: string): string {
  if (!str) return "";
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  } catch (e) {
    try {
      return atob(base64);
    } catch (err) {
      console.error("Failed to decode base64:", err);
      return str;
    }
  }
}

// Helper to recursively extract text body from Gmail parts
function extractBody(payload: any): string {
  if (!payload) return "";

  // If there's a simple body with data
  if (payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }

  // If there are parts
  if (payload.parts) {
    // Look for text/plain first
    const plainPart = payload.parts.find((part: any) => part.mimeType === "text/plain");
    if (plainPart && plainPart.body && plainPart.body.data) {
      return decodeBase64Url(plainPart.body.data);
    }

    // Fallback to text/html
    const htmlPart = payload.parts.find((part: any) => part.mimeType === "text/html");
    if (htmlPart && htmlPart.body && htmlPart.body.data) {
      // Basic tag removal or return as is
      const html = decodeBase64Url(htmlPart.body.data);
      return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }

    // Deep search in nested parts
    for (const part of payload.parts) {
      const nestedBody = extractBody(part);
      if (nestedBody) return nestedBody;
    }
  }

  return "";
}

export async function fetchInboxEmails(accessToken: string, maxResults: number = 5): Promise<Email[]> {
  try {
    // 1. Fetch the list of messages in INBOX
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=label:INBOX`;
    const listRes = await fetch(listUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!listRes.ok) {
      throw new Error(`Gmail API returned error status: ${listRes.status}`);
    }

    const listData = await listRes.json();
    if (!listData.messages || listData.messages.length === 0) {
      return [];
    }

    const fetchedEmails: Email[] = [];

    // 2. Fetch full details for each message
    for (const msgInfo of listData.messages) {
      const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgInfo.id}`;
      const detailRes = await fetch(detailUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (detailRes.ok) {
        const detailData = await detailRes.json();
        const headers = detailData.payload?.headers || [];

        const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === "subject");
        const fromHeader = headers.find((h: any) => h.name.toLowerCase() === "from");

        const subject = subjectHeader ? subjectHeader.value : "No Subject";
        const sender = fromHeader ? fromHeader.value : "Unknown Sender";
        const body = extractBody(detailData.payload) || "No plain text content available.";

        fetchedEmails.push({
          id: `gmail-${detailData.id}`,
          subject,
          sender,
          body: body.slice(0, 1000), // Limit payload length for agent safety
          processed: false,
        });
      }
    }

    return fetchedEmails;
  } catch (error) {
    console.error("Error fetching emails from Gmail API:", error);
    throw error;
  }
}

// Create a draft in Gmail
export async function createGmailDraft(
  accessToken: string,
  to: string,
  subject: string,
  bodyText: string,
  threadId?: string
): Promise<any> {
  try {
    const emailLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "MIME-Version: 1.0",
      "",
      bodyText,
    ];

    const rawEmail = btoa(unescape(encodeURIComponent(emailLines.join("\r\n"))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const payload: any = {
      message: {
        raw: rawEmail,
      },
    };

    if (threadId) {
      payload.message.threadId = threadId;
    }

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gmail API draft creation failed: ${errText}`);
    }

    return await res.json();
  } catch (error) {
    console.error("Error creating draft in Gmail:", error);
    throw error;
  }
}

// Send an email directly via Gmail
export async function sendGmailMessage(
  accessToken: string,
  to: string,
  subject: string,
  bodyText: string,
  threadId?: string
): Promise<any> {
  try {
    const emailLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "MIME-Version: 1.0",
      "",
      bodyText,
    ];

    const rawEmail = btoa(unescape(encodeURIComponent(emailLines.join("\r\n"))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const payload: any = {
      raw: rawEmail,
    };

    if (threadId) {
      payload.threadId = threadId;
    }

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gmail API send failed: ${errText}`);
    }

    return await res.json();
  } catch (error) {
    console.error("Error sending Gmail message:", error);
    throw error;
  }
}

// Batch archive messages (remove INBOX label)
export async function batchArchiveGmailMessages(accessToken: string, ids: string[]): Promise<void> {
  try {
    const rawIds = ids.map(id => id.replace(/^gmail-/, ""));
    if (rawIds.length === 0) return;

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ids: rawIds,
        removeLabelIds: ["INBOX"],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gmail API batch archive failed: ${errText}`);
    }
  } catch (error) {
    console.error("Error batch archiving Gmail messages:", error);
    throw error;
  }
}

// Batch delete/trash messages (add TRASH label, remove INBOX label)
export async function batchDeleteGmailMessages(accessToken: string, ids: string[]): Promise<void> {
  try {
    const rawIds = ids.map(id => id.replace(/^gmail-/, ""));
    if (rawIds.length === 0) return;

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ids: rawIds,
        addLabelIds: ["TRASH"],
        removeLabelIds: ["INBOX"],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gmail API batch delete failed: ${errText}`);
    }
  } catch (error) {
    console.error("Error batch deleting Gmail messages:", error);
    throw error;
  }
}

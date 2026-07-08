import React, { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend
} from "recharts";
import { 
  Mail, 
  Inbox, 
  Send, 
  Calendar, 
  CheckCircle, 
  AlertCircle, 
  Plus, 
  Trash2, 
  Sparkles, 
  Loader2, 
  ArrowUpDown, 
  Check, 
  Clock, 
  Filter,
  User,
  LogOut,
  RefreshCw,
  Info,
  ChevronRight,
  ExternalLink,
  ClipboardList,
  Bell,
  Volume2,
  VolumeX,
  AlertTriangle,
  Archive,
  CheckSquare
} from "lucide-react";
import { Email, AnalysisResult, DraftReply, Reminder, TaskItem, InstantAlert } from "./types";
import { initAuth, googleSignIn, logout, getAccessToken } from "./firebase";
import { fetchInboxEmails, createGmailDraft, sendGmailMessage, batchArchiveGmailMessages, batchDeleteGmailMessages } from "./gmailService";
import { User as FirebaseUser } from "firebase/auth";

// Pre-defined sample emails for immediate demo onboarding
const INITIAL_EMAILS: Email[] = [
  {
    id: "email-1",
    subject: "URGENT: Submit Q2 Expense Reports by tomorrow at 5 PM",
    sender: "finance@company.com",
    body: "Hi team, This is a quick reminder that all Q2 expense reports must be submitted for approval by tomorrow at 5:00 PM. Reports received after this deadline will not be processed until the next cycle. Let me know if you have any questions.",
  },
  {
    id: "email-2",
    subject: "Question regarding our project budget",
    sender: "sara.manager@company.com",
    body: "Hi, I was reviewing the draft proposal for the new project. Can you clarify why the software licensing line-item increased by 15% compared to last quarter? Once I have your explanation, I can submit the final review. Thanks!",
  },
  {
    id: "email-3",
    subject: "Catch up next Tuesday?",
    sender: "alex.consultant@partner.com",
    body: "Hey there, Hope you are doing well. I would love to schedule a quick 30-minute call next Tuesday morning (say, around 10:00 AM) to align on our joint marketing strategy. Let me know if that works or if another time is better.",
  },
  {
    id: "email-4",
    subject: "Approval Required: New hire onboarding software purchase",
    sender: "onboarding-ops@company.com",
    body: "Hello, We need your official sign-off to proceed with the $1,200 annual subscription for the new hire orientation tool. We want to initiate setup immediately so the incoming cohort has access on Monday. Please review and approve.",
  },
  {
    id: "email-5",
    subject: "Weekly Tech Insights: The rise of agentic workflows",
    sender: "newsletter@techinsights.io",
    body: "Hello tech enthusiast! In this week's edition, we explore how agentic workflows are changing software development. No action is required on your part - just sit back, relax, and read about the latest developments in AI and automation.",
  },
  {
    id: "email-6",
    subject: "Flash Sale: Up to 50% off on premium office chairs",
    sender: "deals@ergonomicseating.com",
    body: "Upgrade your workspace today! For the next 48 hours, enjoy massive savings on our best-selling ergonomic task chairs. Shop now before inventory runs out. (To unsubscribe, click the link at the bottom of this email).",
  }
];

export default function App() {
  // Authentication states
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Email state (switches between demo mock emails and real Gmail emails)
  const [emails, setEmails] = useState<Email[]>(() => {
    const saved = localStorage.getItem("smart_inbox_emails");
    return saved ? JSON.parse(saved) : INITIAL_EMAILS;
  });

  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [analyzingIds, setAnalyzingIds] = useState<Record<string, boolean>>({});
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>(() => {
    const saved = localStorage.getItem("smart_inbox_analysis");
    return saved ? JSON.parse(saved) : [];
  });

  // Batch selection & processing states
  const [checkedEmailIds, setCheckedEmailIds] = useState<string[]>([]);
  const [isBatchOperating, setIsBatchOperating] = useState(false);

  // Action Hub persistence lists (driven by automated tool calls)
  const [draftReplies, setDraftReplies] = useState<DraftReply[]>(() => {
    const saved = localStorage.getItem("smart_inbox_drafts");
    return saved ? JSON.parse(saved) : [];
  });
  const [reminders, setReminders] = useState<Reminder[]>(() => {
    const saved = localStorage.getItem("smart_inbox_reminders");
    return saved ? JSON.parse(saved) : [];
  });
  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    const saved = localStorage.getItem("smart_inbox_tasks");
    return saved ? JSON.parse(saved) : [];
  });

  // Alerts & Notifications states
  const [instantAlerts, setInstantAlerts] = useState<InstantAlert[]>(() => {
    const saved = localStorage.getItem("smart_inbox_alerts");
    return saved ? JSON.parse(saved) : [];
  });
  const [activeToast, setActiveToast] = useState<InstantAlert | null>(null);
  const [soundMuted, setSoundMuted] = useState<boolean>(() => {
    const saved = localStorage.getItem("smart_inbox_sound_muted");
    return saved ? saved === "true" : false;
  });

  // UI state managers
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newSender, setNewSender] = useState("");
  const [newBody, setNewBody] = useState("");
  const [filterActionableOnly, setFilterActionableOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<"inbox" | "actions">("inbox");
  const [isLoadingGmail, setIsLoadingGmail] = useState(false);
  const [isGmailMode, setIsGmailMode] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState<boolean>(() => {
    const saved = localStorage.getItem("smart_inbox_auto_analyze");
    return saved ? saved === "true" : true;
  });

  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("smart_inbox_voice_enabled");
    return saved ? saved === "true" : true;
  });

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    return typeof Notification !== "undefined" ? Notification.permission : "default";
  });

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem("smart_inbox_emails", JSON.stringify(emails));
  }, [emails]);

  useEffect(() => {
    localStorage.setItem("smart_inbox_auto_analyze", String(autoAnalyze));
  }, [autoAnalyze]);

  useEffect(() => {
    localStorage.setItem("smart_inbox_voice_enabled", String(voiceEnabled));
  }, [voiceEnabled]);

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const requestNotificationPermission = () => {
    if (typeof Notification !== "undefined") {
      Notification.requestPermission().then(permission => {
        setNotificationPermission(permission);
        if (permission === "granted") {
          sendDesktopNotification("🔔 AI Action Center Activated", "You will now receive instant desktop notifications for critical tasks!");
        }
      });
    }
  };

  const sendDesktopNotification = (title: string, body: string) => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        const n = new Notification(title, {
          body,
          icon: "/favicon.ico",
        });
        n.onclick = () => {
          window.focus();
          setActiveTab("actions");
        };
      } catch (err) {
        console.warn("Desktop notification failed to send:", err);
      }
    }
  };

  const speakAlert = (sender: string, subject: string, summary: string) => {
    if (!voiceEnabled || soundMuted) return;
    try {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        // Clean up email tags for cleaner speech
        const cleanSender = sender.replace(/<.*>/, "").replace(/["']/g, "").trim();
        const cleanSubject = subject.replace(/["']/g, "").trim();
        const cleanSummary = summary.replace(/["']/g, "").trim();
        
        const text = `Attention! Important email from ${cleanSender}. Subject is ${cleanSubject}. Summary: ${cleanSummary}. Let's address this immediately.`;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => v.lang.includes("en-US") || v.lang.includes("en-GB")) || voices[0];
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }
        
        window.speechSynthesis.speak(utterance);
      }
    } catch (err) {
      console.warn("Speech Synthesis failed:", err);
    }
  };

  useEffect(() => {
    localStorage.setItem("smart_inbox_analysis", JSON.stringify(analysisResults));
  }, [analysisResults]);

  useEffect(() => {
    localStorage.setItem("smart_inbox_drafts", JSON.stringify(draftReplies));
  }, [draftReplies]);

  useEffect(() => {
    localStorage.setItem("smart_inbox_reminders", JSON.stringify(reminders));
  }, [reminders]);

  useEffect(() => {
    localStorage.setItem("smart_inbox_tasks", JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem("smart_inbox_alerts", JSON.stringify(instantAlerts));
  }, [instantAlerts]);

  useEffect(() => {
    localStorage.setItem("smart_inbox_sound_muted", String(soundMuted));
  }, [soundMuted]);

  // Handle Firebase Auth lifecycle
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
        setNeedsAuth(false);
        setIsGmailMode(true);
        // Automatically fetch real emails on load if token is cached
        loadRealGmailInbox(token);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setNeedsAuth(true);
        setIsGmailMode(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Set default selected email on load
  useEffect(() => {
    if (emails.length > 0 && !selectedEmail) {
      setSelectedEmail(emails[0]);
    }
  }, [emails, selectedEmail]);

  // Google Sign-In trigger with user confirmation check before choosing
  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        setNeedsAuth(false);
        setIsGmailMode(true);
        // Automatically fetch real emails upon login
        await loadRealGmailInbox(result.accessToken);
      }
    } catch (err: any) {
      const errCode = err?.code || "";
      const errMsg = err?.message || "";
      const isCancelled = 
        errCode === "auth/popup-closed-by-user" || 
        errCode === "auth/cancelled-popup-request" ||
        errMsg.includes("popup-closed-by-user") ||
        errMsg.includes("cancelled-popup-request");

      if (isCancelled) {
        console.info("Sign in cancelled or closed by user.");
      } else {
        alert(`Login failed: ${err.message || err}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Switch to a different Google Account / Gmail (prompts account chooser)
  const handleSwitchAccount = async () => {
    setIsLoggingIn(true);
    try {
      // Cleanly sign out current user first
      await logout();
      setUser(null);
      setAccessToken(null);
      setIsGmailMode(false);

      // Trigger sign-in which forces account chooser prompt
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        setNeedsAuth(false);
        setIsGmailMode(true);
        await loadRealGmailInbox(result.accessToken);
        alert(`Successfully switched and connected to: ${result.user.email}`);
      }
    } catch (err: any) {
      const errCode = err?.code || "";
      const errMsg = err?.message || "";
      const isCancelled = 
        errCode === "auth/popup-closed-by-user" || 
        errCode === "auth/cancelled-popup-request" ||
        errMsg.includes("popup-closed-by-user") ||
        errMsg.includes("cancelled-popup-request");

      if (isCancelled) {
        console.info("Switch account cancelled or closed by user.");
      } else {
        alert(`Account switch failed: ${err.message || err}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Google Logout trigger
  const handleLogout = async () => {
    if (window.confirm("Disconnect Gmail and return to offline demo mode?")) {
      await logout();
      setUser(null);
      setAccessToken(null);
      setIsGmailMode(false);
      setEmails(INITIAL_EMAILS);
      setSelectedEmail(INITIAL_EMAILS[0]);
    }
  };

  // Fetch real emails from Gmail API
  const loadRealGmailInbox = async (token: string) => {
    setIsLoadingGmail(true);
    setCheckedEmailIds([]);
    try {
      const gEmails = await fetchInboxEmails(token, 8);
      if (gEmails.length > 0) {
        setEmails(gEmails);
        setSelectedEmail(gEmails[0]);
        
        if (autoAnalyze) {
          // Fire-and-forget or await direct analysis of the new live inbox messages
          processEmails(gEmails);
        }
      } else {
        alert("No messages found in your primary Gmail Inbox.");
      }
    } catch (error: any) {
      const errStr = String(error.message || error);
      if (errStr.includes("401") || errStr.toLowerCase().includes("unauthorized") || errStr.toLowerCase().includes("credentials")) {
        console.warn("Gmail session expired or unauthorized:", error);
        alert("Your Gmail connected session has expired or is unauthorized. Please click 'Connect Gmail Account' to re-authenticate.");
        // Clear expired state
        setUser(null);
        setAccessToken(null);
        setIsGmailMode(false);
        setNeedsAuth(true);
        try {
          localStorage.removeItem("gmail_access_token");
        } catch (e) {}
      } else {
        alert(`Failed to load Gmail Inbox: ${error.message || error}`);
      }
    } finally {
      setIsLoadingGmail(false);
    }
  };

  // Manual Refresh for Gmail mode
  const handleRefreshGmail = () => {
    if (accessToken) {
      loadRealGmailInbox(accessToken);
    }
  };

  // Compose simulated email (for demo mode)
  const handleAddEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject || !newSender || !newBody) return;

    const newEmail: Email = {
      id: `custom-${Date.now()}`,
      subject: newSubject,
      sender: newSender,
      body: newBody,
      processed: false,
      isCustom: true
    };

    setEmails(prev => [newEmail, ...prev]);
    setSelectedEmail(newEmail);
    setShowAddForm(false);
    setNewSubject("");
    setNewSender("");
    setNewBody("");
  };

  // Delete email locally
  const handleDeleteEmail = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = emails.filter(em => em.id !== id);
    setEmails(updated);
    if (selectedEmail?.id === id) {
      setSelectedEmail(updated[0] || null);
    }
    // Remove from checked ids if checked
    setCheckedEmailIds(prev => prev.filter(cId => cId !== id));
    // Remove corresponding processed actions
    setAnalysisResults(prev => prev.filter(res => res.original_email.id !== id));
    setDraftReplies(prev => prev.filter(dr => dr.emailId !== id));
    setReminders(prev => prev.filter(rem => rem.emailId !== id));
    setTasks(prev => prev.filter(t => t.emailId !== id));
  };

  // Batch delete selected emails (Trash in Gmail, remove from state locally)
  const handleBatchDelete = async () => {
    if (checkedEmailIds.length === 0) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete the ${checkedEmailIds.length} selected email(s)?`
    );
    if (!confirmDelete) return;

    setIsBatchOperating(true);
    try {
      if (isGmailMode && accessToken) {
        // Run batch delete via Gmail API (move to Trash and remove INBOX label)
        await batchDeleteGmailMessages(accessToken, checkedEmailIds);
      }

      // Update local state (remove them from inbox list)
      const updated = emails.filter(em => !checkedEmailIds.includes(em.id));
      setEmails(updated);
      
      // If the currently selected email was deleted, select the first remaining
      if (selectedEmail && checkedEmailIds.includes(selectedEmail.id)) {
        setSelectedEmail(updated[0] || null);
      }

      // Remove corresponding processed actions from action hub
      setAnalysisResults(prev => prev.filter(res => !checkedEmailIds.includes(res.original_email.id)));
      setDraftReplies(prev => prev.filter(dr => !checkedEmailIds.includes(dr.emailId)));
      setReminders(prev => prev.filter(rem => !checkedEmailIds.includes(rem.emailId)));
      setTasks(prev => prev.filter(t => !checkedEmailIds.includes(t.emailId)));

      alert(`Successfully deleted ${checkedEmailIds.length} email(s)`);
      setCheckedEmailIds([]); // Reset checklist
    } catch (error: any) {
      console.error("Batch delete error:", error);
      alert(`Failed to delete selected emails: ${error.message || error}`);
    } finally {
      setIsBatchOperating(false);
    }
  };

  // Batch archive selected emails (Archive in Gmail, hide from inbox state locally)
  const handleBatchArchive = async () => {
    if (checkedEmailIds.length === 0) return;
    const confirmArchive = window.confirm(
      `Are you sure you want to archive the ${checkedEmailIds.length} selected email(s)?`
    );
    if (!confirmArchive) return;

    setIsBatchOperating(true);
    try {
      if (isGmailMode && accessToken) {
        // Run batch archive via Gmail API (remove INBOX label)
        await batchArchiveGmailMessages(accessToken, checkedEmailIds);
      }

      // Mark selected as archived locally
      const updated = emails.map(em => 
        checkedEmailIds.includes(em.id) ? { ...em, archived: true } : em
      );
      setEmails(updated);

      // If the currently selected email was archived, select the first remaining non-archived
      if (selectedEmail && checkedEmailIds.includes(selectedEmail.id)) {
        const remaining = updated.filter(em => !em.archived);
        setSelectedEmail(remaining[0] || null);
      }

      alert(`Successfully archived ${checkedEmailIds.length} email(s)`);
      setCheckedEmailIds([]); // Reset checklist
    } catch (error: any) {
      console.error("Batch archive error:", error);
      alert(`Failed to archive selected emails: ${error.message || error}`);
    } finally {
      setIsBatchOperating(false);
    }
  };

  // Clear or reset demo state
  const handleResetDemo = () => {
    if (window.confirm("Are you sure you want to reset all data back to the default demo state?")) {
      setEmails(INITIAL_EMAILS);
      setSelectedEmail(INITIAL_EMAILS[0]);
      setAnalysisResults([]);
      setDraftReplies([]);
      setReminders([]);
      setTasks([]);
      setCheckedEmailIds([]);
      setFilterActionableOnly(false);
      setActiveTab("inbox");
    }
  };

  // Synthesize instant alert chime using standard Web Audio API
  const playAlertChime = () => {
    if (soundMuted) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc1.type = "sine";
      osc2.type = "sine";
      
      // Warm twin-tone melodic chime
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc1.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5
      
      osc2.frequency.setValueAtTime(783.99, ctx.currentTime); // G5
      osc2.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.15); // C6
      
      gainNode.gain.setValueAtTime(0.0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.5);
      osc2.stop(ctx.currentTime + 0.5);
    } catch (err) {
      console.warn("Audio feedback context failed to initialize:", err);
    }
  };

  // Run AI Agent Analysis & Action mapping
  const processEmails = async (emailsToProcess: Email[]) => {
    if (emailsToProcess.length === 0) return;

    // Set processing load states
    const idsToAnalyze: Record<string, boolean> = {};
    emailsToProcess.forEach(em => {
      idsToAnalyze[em.id] = true;
    });
    setAnalyzingIds(prev => ({ ...prev, ...idsToAnalyze }));

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ emails: emailsToProcess }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Server error during analysis");
      }

      const data = await response.json();
      if (data.success && data.results) {
        const parsedResults: AnalysisResult[] = [];
        const newAlerts: InstantAlert[] = [];

        data.results.forEach((res: any) => {
          const analysisRes: AnalysisResult = res;
          parsedResults.push(analysisRes);

          const emailId = analysisRes.original_email.id;
          const { step1, step2, step3, step4, step5 } = analysisRes.analysis;
          const priority = step3.priority_score;
          const args = step4.tool_args;

          // Clear any stale automated actions for this email to avoid duplicates
          setDraftReplies(prev => prev.filter(dr => dr.emailId !== emailId));
          setReminders(prev => prev.filter(rem => rem.emailId !== emailId));
          setTasks(prev => prev.filter(t => t.emailId !== emailId));

          // Run Step 4: Map classification to the Action Center (Simulating API Tool executions)
          if (step1.action_needed && step4.tool_name) {
            if (step4.tool_name === "draft_reply") {
              setDraftReplies(prev => [
                ...prev,
                {
                  id: `draft-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                  emailId,
                  sender: analysisRes.original_email.sender,
                  subject: analysisRes.original_email.subject,
                  summary: args.email_summary || "No summary",
                  reply: args.suggested_reply || "",
                  priority,
                  sent: false
                }
              ]);
            } else if (step4.tool_name === "create_reminder") {
              setReminders(prev => [
                ...prev,
                {
                  id: `reminder-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                  emailId,
                  title: args.title || `Follow up: ${analysisRes.original_email.subject}`,
                  suggestedTime: args.suggested_time || "not specified",
                  notes: args.notes || "",
                  priority,
                  addedToCalendar: false
                }
              ]);
            } else if (step4.tool_name === "log_task") {
              setTasks(prev => [
                ...prev,
                {
                  id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                  emailId,
                  description: args.task_description || analysisRes.original_email.subject,
                  deadline: args.deadline || "not specified",
                  priority: step2.category === "APPROVAL_NEEDED" ? 5 : priority,
                  completed: false
                }
              ]);
            }
          }

          // Trigger Immediate Notification for Important Messages (priority score >= 4)
          if (step1.action_needed && priority >= 4) {
            const alertId = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            const newAlert: InstantAlert = {
              id: alertId,
              emailId,
              subject: analysisRes.original_email.subject,
              sender: analysisRes.original_email.sender,
              oneLineSummary: step5.one_line_summary,
              priority,
              urgencyReason: step3.urgency_reason,
              category: step2.category,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              dismissed: false
            };
            newAlerts.push(newAlert);

            // Send standard desktop notification
            sendDesktopNotification(
              `⚠️ Urgent Action (P${priority}): ${analysisRes.original_email.subject}`,
              `From: ${analysisRes.original_email.sender}\n${step5.one_line_summary}`
            );
          }
        });

        // Trigger notifications and play audio chime
        if (newAlerts.length > 0) {
          setInstantAlerts(prev => [...newAlerts, ...prev]);
          // Display the first (most urgent) alert as active toast
          setActiveToast(newAlerts[0]);
          playAlertChime();

          // Speak the most critical alert out loud
          const topAlert = newAlerts[0];
          speakAlert(topAlert.sender, topAlert.subject, topAlert.oneLineSummary);
        }

        // Update main analysis repository
        setAnalysisResults(prev => {
          const filtered = prev.filter(p => !emailsToProcess.some(e => e.id === p.original_email.id));
          return [...filtered, ...parsedResults];
        });

        // Mark processed flag
        setEmails(prev => prev.map(em => {
          if (emailsToProcess.some(e => e.id === em.id)) {
            return { ...em, processed: true };
          }
          return em;
        }));

        // Keep selected email reference synchronized
        if (selectedEmail && emailsToProcess.some(e => e.id === selectedEmail.id)) {
          setSelectedEmail({ ...selectedEmail, processed: true });
        }
      }
    } catch (err: any) {
      alert(`Agent execution failed: ${err.message || err}`);
    } finally {
      // Clear load indicator
      setAnalyzingIds(prev => {
        const copy = { ...prev };
        emailsToProcess.forEach(em => {
          delete copy[em.id];
        });
        return copy;
      });
    }
  };

  // Gmail-Action: Send or save drafted reply to actual Gmail account
  const handleExecuteGmailReply = async (draft: DraftReply, method: "draft" | "send") => {
    if (!accessToken) {
      alert("No active Google Session. Please log in first.");
      return;
    }

    // MANDATORY explicit user confirmation before mutating/writing user data
    const actionLabel = method === "draft" ? "save as draft in" : "send directly from";
    const confirmed = window.confirm(
      `Confirm action:\nAre you sure you want to ${actionLabel} your Gmail account?\n\nRecipient: ${draft.sender}\nSubject: Re: ${draft.subject}\n\nContent:\n${draft.reply}`
    );
    
    if (!confirmed) return;

    try {
      // Extract original Gmail thread/message id from emailId
      const cleanMsgId = draft.emailId.replace("gmail-", "");
      
      if (method === "draft") {
        await createGmailDraft(accessToken, draft.sender, `Re: ${draft.subject}`, draft.reply, cleanMsgId);
        alert("Draft successfully saved to your Gmail account!");
      } else {
        await sendGmailMessage(accessToken, draft.sender, `Re: ${draft.subject}`, draft.reply, cleanMsgId);
        alert("Reply successfully sent via Gmail!");
      }

      // Update draft reply resolved status
      setDraftReplies(prev => prev.map(d => d.id === draft.id ? { ...d, sent: true } : d));
    } catch (err: any) {
      alert(`Gmail execution failed: ${err.message || err}`);
    }
  };

  // Generic toggle actions
  const toggleTaskCompleted = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const toggleReminderCalendar = (id: string) => {
    // Show confirmation for marking calendar
    const conf = window.confirm("Mark this call/meeting reminder as synchronized to your Calendar?");
    if (conf) {
      setReminders(prev => prev.map(r => r.id === id ? { ...r, addedToCalendar: true } : r));
    }
  };

  // Extract selected email's active analysis results
  const currentAnalysis = analysisResults.find(r => r.original_email.id === selectedEmail?.id);

  // Sorting analysis results by Priority score (highest first) for the ranked summary panel
  const rankedSummaries = [...analysisResults]
    .sort((a, b) => b.analysis.step3.priority_score - a.analysis.step3.priority_score);

  // Stats Counters
  const totalActionable = analysisResults.filter(r => r.analysis.step1.action_needed).length;
  const pendingActionsCount = draftReplies.filter(d => !d.sent).length + 
                             reminders.filter(r => !r.addedToCalendar).length + 
                             tasks.filter(t => !t.completed).length;

  const urgentDrafts = draftReplies.filter(d => !d.sent && d.priority >= 4);
  const urgentReminders = reminders.filter(r => !r.addedToCalendar && r.priority >= 4);
  const urgentTasks = tasks.filter(t => !t.completed && t.priority >= 4);
  const totalUrgentCount = urgentDrafts.length + urgentReminders.length + urgentTasks.length;

  // Chart state and calculations
  const [chartFilter, setChartFilter] = useState<"all" | "pending" | "completed">("all");

  const chartData = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    
    const matchesFilter = (item: { sent?: boolean; addedToCalendar?: boolean; completed?: boolean }) => {
      const isDone = item.sent || item.addedToCalendar || item.completed;
      if (chartFilter === "pending") return !isDone;
      if (chartFilter === "completed") return !!isDone;
      return true; // "all"
    };

    draftReplies.forEach(d => {
      if (matchesFilter(d)) counts[d.priority] = (counts[d.priority] || 0) + 1;
    });
    reminders.forEach(r => {
      if (matchesFilter(r)) counts[r.priority] = (counts[r.priority] || 0) + 1;
    });
    tasks.forEach(t => {
      if (matchesFilter(t)) counts[t.priority] = (counts[t.priority] || 0) + 1;
    });

    const labels: Record<number, string> = {
      5: "Critical (Priority 5)",
      4: "High (Priority 4)",
      3: "Medium (Priority 3)",
      2: "Low-Medium (Priority 2)",
      1: "Low (Priority 1)"
    };

    const colors: Record<number, string> = {
      5: "#ef4444", // red-500
      4: "#f97316", // orange-500
      3: "#f59e0b", // amber-500
      2: "#eab308", // yellow-500
      1: "#94a3b8"  // slate-400
    };

    return [5, 4, 3, 2, 1].map(priority => ({
      name: labels[priority],
      value: counts[priority] || 0,
      color: colors[priority],
      priority
    })).filter(item => item.value > 0);
  }, [draftReplies, reminders, tasks, chartFilter]);

  const totalChartItems = useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.value, 0);
  }, [chartData]);

  const legendCounts = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    
    const matchesFilter = (item: { sent?: boolean; addedToCalendar?: boolean; completed?: boolean }) => {
      const isDone = item.sent || item.addedToCalendar || item.completed;
      if (chartFilter === "pending") return !isDone;
      if (chartFilter === "completed") return !!isDone;
      return true; // "all"
    };

    draftReplies.forEach(d => {
      if (matchesFilter(d)) counts[d.priority] = (counts[d.priority] || 0) + 1;
    });
    reminders.forEach(r => {
      if (matchesFilter(r)) counts[r.priority] = (counts[r.priority] || 0) + 1;
    });
    tasks.forEach(t => {
      if (matchesFilter(t)) counts[t.priority] = (counts[t.priority] || 0) + 1;
    });
    return counts;
  }, [draftReplies, reminders, tasks, chartFilter]);

  // Memoized displayed emails (excluding archived ones, matching the filter toggle)
  const displayEmails = useMemo(() => {
    return emails.filter(em => {
      if (em.archived) return false;
      if (!filterActionableOnly) return true;
      const matchingAnalysis = analysisResults.find(r => r.original_email.id === em.id);
      return matchingAnalysis?.analysis.step1.action_needed === true;
    });
  }, [emails, filterActionableOnly, analysisResults]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased" id="main-app-container">
      {/* Brand Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm" id="app-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-md">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Smart Inbox-to-Action Agent</h1>
              <p className="text-xs text-slate-500 font-medium">Automatic Gmail Classification, Urgency Ranking &amp; Task Automation</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            {isGmailMode && user ? (
              <div className="flex items-center gap-3 bg-slate-100 p-1.5 pr-3 rounded-full border border-slate-200">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || "User"} referrerPolicy="no-referrer" className="w-8 h-8 rounded-full shadow-inner" />
                ) : (
                  <div className="bg-indigo-500 text-white w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold font-mono">
                    {user.email?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-left hidden sm:block">
                  <p className="text-xs font-bold text-slate-800 leading-none">{user.displayName || "Connected User"}</p>
                  <p className="text-[10px] text-slate-500 font-mono leading-tight">{user.email}</p>
                </div>
                <div className="flex items-center gap-1.5 border-l border-slate-250 pl-1.5">
                  <button
                    onClick={handleSwitchAccount}
                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-200/80 rounded-full transition-all cursor-pointer flex items-center justify-center"
                    title="Switch Google Account / Change Email"
                    id="switch-gmail-account-btn"
                  >
                    <ArrowUpDown className="w-4 h-4 text-indigo-500" />
                  </button>
                  <button
                    onClick={handleLogout}
                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-200/80 rounded-full transition-all cursor-pointer flex items-center justify-center"
                    title="Disconnect Gmail"
                    id="disconnect-gmail-account-btn"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold py-2 px-3.5 rounded-lg shadow-sm transition-all flex items-center gap-2 cursor-pointer"
                id="connect-gmail-btn"
              >
                {isLoggingIn ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                )}
                Connect Gmail Account
              </button>
            )}

            {isGmailMode && (
              <label 
                className="flex items-center gap-2 text-xs font-bold text-indigo-700 bg-indigo-50/80 border border-indigo-150 px-3 py-2 rounded-lg cursor-pointer hover:bg-indigo-100/60 transition-all shadow-3xs" 
                title="When active, newly fetched Gmail messages are automatically analyzed via Gemini"
                id="auto-analyze-toggle"
              >
                <input
                  type="checkbox"
                  checked={autoAnalyze}
                  onChange={(e) => setAutoAnalyze(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-3.5 h-3.5"
                />
                <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                <span>Auto-Analyze</span>
              </label>
            )}

            {isGmailMode ? (
              <button
                onClick={handleRefreshGmail}
                disabled={isLoadingGmail}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-3.5 rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                id="refresh-gmail-btn"
              >
                {isLoadingGmail ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Sync Inbox
              </button>
            ) : (
              <button
                onClick={handleResetDemo}
                className="text-slate-500 hover:text-slate-800 border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold py-2 px-3 rounded-lg transition-colors cursor-pointer"
                id="reset-demo-btn"
              >
                Reset Demo
              </button>
            )}

            {/* AI Notification & Voice Broadcaster Hub */}
            <div className="flex items-center gap-1.5 bg-indigo-50/50 p-1 rounded-xl border border-indigo-100/60" id="ai-broadcaster-controls">
              {/* Voice Alert Toggle */}
              <button
                onClick={() => {
                  const val = !voiceEnabled;
                  setVoiceEnabled(val);
                  if (val) {
                    try {
                      if (typeof window !== "undefined" && window.speechSynthesis) {
                        const u = new SpeechSynthesisUtterance("Voice reminders enabled.");
                        window.speechSynthesis.speak(u);
                      }
                    } catch (e) {}
                  }
                }}
                className={`p-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  voiceEnabled 
                    ? "bg-indigo-600 text-white shadow-3xs hover:bg-indigo-700" 
                    : "bg-white text-slate-500 hover:text-slate-800 border border-slate-200"
                }`}
                title={voiceEnabled ? "Voice Reminders: Enabled" : "Voice Reminders: Muted"}
                id="voice-toggle-btn"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
                <span className="hidden xl:inline text-[10px]">Voice Broadcaster</span>
              </button>

              {/* Desktop Push Alerts Permission */}
              <button
                onClick={requestNotificationPermission}
                className={`p-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  notificationPermission === "granted"
                    ? "bg-emerald-600 text-white shadow-3xs"
                    : "bg-white text-slate-500 hover:text-slate-800 border border-slate-200"
                }`}
                title={`Browser Desktop Notification Status: ${notificationPermission}`}
                id="desktop-notify-btn"
              >
                <Bell className="w-4 h-4 shrink-0" />
                <span className="hidden xl:inline text-[10px]">
                  {notificationPermission === "granted" ? "Push Alerts On" : "Enable Push Alerts"}
                </span>
              </button>

              {/* Test AI Voice & Push Alert */}
              <button
                onClick={() => {
                  speakAlert("AI Assistant Demo", "Urgent Activity Check", "This is a successful demonstration of your intelligent voice broadcast. AI will notify you immediately when critical emails are analyzed.");
                  sendDesktopNotification("🔔 AI Action Demonstration", "This is how important email action alerts are pushed to your screen immediately.");
                }}
                className="p-2 bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-600 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                title="Trigger a test voice and desktop push alert"
                id="test-ai-alerts-btn"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-[10px] hidden md:inline">Test Broadcast</span>
              </button>
            </div>

            <button
              onClick={() => setSoundMuted(!soundMuted)}
              className={`p-2 rounded-lg border text-xs font-semibold flex items-center justify-center transition-all cursor-pointer ${
                soundMuted 
                  ? "bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100/50 shadow-2xs" 
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 shadow-3xs"
              }`}
              title={soundMuted ? "Sound Alerts Muted" : "Sound Alerts Active"}
              id="sound-mute-toggle-btn"
            >
              {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Connection Notice banner */}
        {!isGmailMode && (
          <div className="mb-6 bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="bg-indigo-100 text-indigo-600 p-2 rounded-lg shrink-0 mt-0.5">
                <Info className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-indigo-900">Running in Demo Sandbox Mode</p>
                <p className="text-xs text-indigo-700 mt-0.5">
                  Currently showcasing pre-loaded sample emails. Click <strong>Connect Gmail Account</strong> to grant read/write access and process your live messages securely!
                </p>
              </div>
            </div>
            <button
              onClick={handleLogin}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 px-3.5 rounded-lg shadow-xs cursor-pointer shrink-0"
            >
              Connect My Gmail
            </button>
          </div>
        )}

        {/* Action-to-Inbox Status Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" id="dashboard-stats">
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-4 shadow-xs" id="stat-total">
            <div className="bg-slate-100 p-3 rounded-lg text-slate-600">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Messages</span>
              <span className="text-2xl font-bold text-slate-800">{emails.filter(e => !e.archived).length}</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-4 shadow-xs" id="stat-processed">
            <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">Analyzed by AI</span>
              <span className="text-2xl font-bold text-indigo-800">
                {analysisResults.filter(r => !emails.find(e => e.id === r.original_email.id)?.archived).length} <span className="text-xs text-slate-400 font-normal">/ {emails.filter(e => !e.archived).length}</span>
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-4 shadow-xs" id="stat-actionable">
            <div className="bg-amber-50 p-3 rounded-lg text-amber-600">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider block">Actionable Items</span>
              <span className="text-2xl font-bold text-amber-800">{totalActionable}</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-4 shadow-xs" id="stat-pending">
            <div className="bg-emerald-50 p-3 rounded-lg text-emerald-600">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider block">Task Center Backlog</span>
              <span className="text-2xl font-bold text-emerald-800">{pendingActionsCount}</span>
            </div>
          </div>
        </div>

        {/* App Main Navigation Tabs */}
        <div className="flex border-b border-slate-200 mb-6 gap-2" id="navigation-tabs">
          <button
            onClick={() => setActiveTab("inbox")}
            className={`py-3 px-4 font-bold text-xs uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === "inbox" 
                ? "border-indigo-600 text-indigo-600 bg-white rounded-t-lg" 
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
            }`}
            id="tab-inbox"
          >
            <Inbox className="w-4 h-4" />
            Email Inbox &amp; Decision Panel
            <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full ml-1">
              {emails.filter(e => !e.processed && !e.archived).length} new
            </span>
          </button>
          <button
            onClick={() => setActiveTab("actions")}
            className={`py-3 px-4 font-bold text-xs uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === "actions" 
                ? "border-indigo-600 text-indigo-600 bg-white rounded-t-lg" 
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
            }`}
            id="tab-actions"
          >
            <CheckCircle className="w-4 h-4" />
            Automated Task Center
            {pendingActionsCount > 0 && (
              <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-1">
                {pendingActionsCount}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: EMAIL INBOX & PROCESSOR */}
        {activeTab === "inbox" && (
          <div className="space-y-6" id="inbox-layout-container">
            {/* Live High-Priority Alerts Banner */}
            {instantAlerts.filter(a => !a.dismissed).length > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-rose-600 animate-bounce" />
                    <h3 className="text-xs font-bold text-rose-950 uppercase tracking-wider">
                      🚨 Live High-Priority Urgent Alerts ({instantAlerts.filter(a => !a.dismissed).length})
                    </h3>
                  </div>
                  <button 
                    onClick={() => {
                      if (window.confirm("Dismiss all urgent alerts?")) {
                        setInstantAlerts(prev => prev.map(a => ({ ...a, dismissed: true })));
                      }
                    }}
                    className="text-rose-600 hover:text-rose-800 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Dismiss All
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {instantAlerts.filter(a => !a.dismissed).map(alert => (
                    <div key={alert.id} className="bg-white p-3.5 rounded-lg border border-rose-100 flex flex-col justify-between gap-3 shadow-2xs relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-[9px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-sm border border-rose-100">
                            Priority {alert.priority} &bull; {alert.category}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono font-medium">{alert.timestamp}</span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-800 line-clamp-1">{alert.subject}</h4>
                        <p className="text-[10px] text-slate-500 truncate mt-0.5">From: {alert.sender}</p>
                        <p className="text-xs text-slate-700 font-medium italic mt-2 bg-slate-50 p-2.5 rounded border border-slate-100">
                          "{alert.oneLineSummary}"
                        </p>
                        {alert.urgencyReason && (
                          <p className="text-[10px] text-rose-600 font-medium mt-1.5 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                            {alert.urgencyReason}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 justify-end mt-1 pt-2 border-t border-slate-50">
                        <button
                          onClick={() => {
                            const matchedEmail = emails.find(e => e.id === alert.emailId);
                            if (matchedEmail) {
                              setSelectedEmail(matchedEmail);
                            }
                          }}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold py-1.5 px-3 rounded-md transition-colors cursor-pointer shadow-3xs"
                        >
                          View Reasoner
                        </button>
                        <button
                          onClick={() => {
                            setInstantAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, dismissed: true } : a));
                          }}
                          className="border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 text-[10px] font-bold py-1.5 px-3 rounded-md transition-colors cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="inbox-layout-grid">
            
            {/* Left Column: Email list */}
            <div className="lg:col-span-5 flex flex-col gap-4" id="inbox-left-column">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs flex flex-col h-[650px]" id="email-list-panel">
                
                {/* Header bar of email lists */}
                <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold text-xs text-slate-600 uppercase tracking-wider">
                    <Mail className="w-4 h-4 text-indigo-600" />
                    <span>{isGmailMode ? "Real Gmail Inbox" : "Mock Inbox Demo"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setFilterActionableOnly(!filterActionableOnly)}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        filterActionableOnly 
                          ? "bg-amber-50 text-amber-700 border-amber-200 shadow-xs" 
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                      title="Toggle filtering actionable messages only"
                      id="toggle-actionable-filter"
                    >
                      <Filter className="w-3.5 h-3.5" />
                      Actionable
                    </button>
                    {!isGmailMode && (
                      <button
                        onClick={() => setShowAddForm(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-sm cursor-pointer"
                        id="open-compose-btn"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Simulate
                      </button>
                    )}
                  </div>
                </div>

                {/* Simulate custom incoming email form */}
                {showAddForm && !isGmailMode && (
                  <form onSubmit={handleAddEmail} className="p-4 border-b border-slate-200 bg-indigo-50/40 space-y-3" id="compose-email-form">
                    <div className="flex justify-between items-center mb-1">
                      <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-wider">Simulate Custom Email</h4>
                      <button 
                        type="button" 
                        onClick={() => setShowAddForm(false)} 
                        className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Quick Load Template</label>
                      <select
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "urgent_exp") {
                            setNewSender("finance@company.com");
                            setNewSubject("URGENT: Submit Q2 Expense Reports by tomorrow at 5 PM");
                            setNewBody("Hi team, This is a quick reminder that all Q2 expense reports must be submitted for approval by tomorrow at 5:00 PM. Reports received after this deadline will not be processed until the next cycle. Let me know if you have any questions.");
                          } else if (val === "urgent_infra") {
                            setNewSender("infra-ops@company.com");
                            setNewSubject("CRITICAL: Server CPU load at 98% - upgrade node immediately");
                            setNewBody("Hello, our primary web server CPU usage is running dangerously high. We must scale the node cluster up to 3 instances immediately to avoid downtime during the marketing launch. Please authorize the $150 transaction ASAP.");
                          } else if (val === "reply_needed") {
                            setNewSender("investor@ventures.com");
                            setNewSubject("Quick clarification regarding Q3 financial projection");
                            setNewBody("Hi, I was reviewing the pitch deck and noticed a discrepancy on slide 12. Can you explain why the customer acquisition cost drops by 40% in Year 2? Let me know, thanks.");
                          } else if (val === "newsletter") {
                            setNewSender("digest@dailydose.io");
                            setNewSubject("Daily Insights: AI tools and why context windows matter");
                            setNewBody("Hi reader, today we dive into how context length impacts RAG performance and model attention. No action is required on your part, enjoy!");
                          }
                        }}
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 bg-white cursor-pointer font-medium text-slate-700"
                      >
                        <option value="">-- Choose a preset template --</option>
                        <option value="urgent_exp">🚨 Urgent Expenses (Priority 5)</option>
                        <option value="urgent_infra">🔥 Critical Server Failure (Priority 5)</option>
                        <option value="reply_needed">💬 Investor Clarification (Priority 3)</option>
                        <option value="newsletter">📰 Tech Newsletter (Priority 1)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">From Sender</label>
                      <input
                        type="text"
                        placeholder="e.g. boss@enterprise.com"
                        value={newSender}
                        onChange={(e) => setNewSender(e.target.value)}
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Subject</label>
                      <input
                        type="text"
                        placeholder="e.g. Critical database failure feedback"
                        value={newSubject}
                        onChange={(e) => setNewSubject(e.target.value)}
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Email Content</label>
                      <textarea
                        placeholder="Type the message body here..."
                        value={newBody}
                        onChange={(e) => setNewBody(e.target.value)}
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 bg-white h-20 resize-none"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 rounded-lg shadow-xs transition-colors cursor-pointer"
                    >
                      Insert into Inbox
                    </button>
                  </form>
                )}

                {/* Batch Actions control bar */}
                {!isLoadingGmail && emails.filter(e => !e.archived).length > 0 && (
                  <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2 text-xs" id="batch-actions-bar">
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-600 select-none">
                        <input
                          type="checkbox"
                          checked={displayEmails.length > 0 && displayEmails.every(em => checkedEmailIds.includes(em.id))}
                          ref={el => {
                            if (el) {
                              const isAll = displayEmails.length > 0 && displayEmails.every(em => checkedEmailIds.includes(em.id));
                              const isSome = displayEmails.length > 0 && !isAll && displayEmails.some(em => checkedEmailIds.includes(em.id));
                              el.indeterminate = isSome;
                            }
                          }}
                          onChange={() => {
                            const isAll = displayEmails.length > 0 && displayEmails.every(em => checkedEmailIds.includes(em.id));
                            if (isAll) {
                              // Deselect all displayed
                              setCheckedEmailIds(prev => prev.filter(id => !displayEmails.some(em => em.id === id)));
                            } else {
                              // Select all displayed
                              setCheckedEmailIds(prev => {
                                const otherChecked = prev.filter(id => !displayEmails.some(em => em.id === id));
                                return [...otherChecked, ...displayEmails.map(em => em.id)];
                              });
                            }
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-3.5 h-3.5"
                        />
                        <span>Select All ({displayEmails.length})</span>
                      </label>
                    </div>

                    {checkedEmailIds.length > 0 && (
                      <div className="flex items-center gap-2 animate-fade-in" id="batch-buttons-container">
                        <span className="font-semibold text-indigo-600 font-mono bg-indigo-50 px-2 py-0.5 rounded-full text-[10px]">
                          {checkedEmailIds.length} Selected
                        </span>
                        <button
                          onClick={handleBatchArchive}
                          disabled={isBatchOperating}
                          className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-bold py-1 px-2.5 rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer transition-all hover:border-slate-300"
                          title="Archive selected emails"
                          id="batch-archive-btn"
                        >
                          {isBatchOperating ? (
                            <Loader2 className="w-3 h-3 animate-spin text-slate-500" />
                          ) : (
                            <Archive className="w-3 h-3 text-slate-500" />
                          )}
                          <span>Archive</span>
                        </button>
                        <button
                          onClick={handleBatchDelete}
                          disabled={isBatchOperating}
                          className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-[10px] font-bold py-1 px-2.5 rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer transition-all hover:border-rose-300"
                          title="Delete selected emails"
                          id="batch-delete-btn"
                        >
                          {isBatchOperating ? (
                            <Loader2 className="w-3 h-3 animate-spin text-rose-500" />
                          ) : (
                            <Trash2 className="w-3 h-3 text-rose-500" />
                          )}
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Email item rows scroll viewport */}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100" id="emails-scroll-container">
                  {isLoadingGmail ? (
                    <div className="p-12 text-center" id="loading-emails-placeholder">
                      <Loader2 className="w-8 h-8 mx-auto text-indigo-500 animate-spin mb-3" />
                      <p className="text-sm font-semibold text-slate-700">Fetching Inbox messages...</p>
                      <p className="text-xs text-slate-400 mt-1 font-mono">Querying Gmail REST API...</p>
                    </div>
                  ) : emails.filter(em => !em.archived).length === 0 ? (
                    <div className="p-8 text-center" id="empty-inbox-placeholder">
                      <Mail className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p className="text-sm font-semibold text-slate-500">Inbox is empty</p>
                      <p className="text-xs text-slate-400 mt-1">Try simulating a custom email or reconnecting.</p>
                    </div>
                  ) : displayEmails.length === 0 ? (
                    <div className="p-8 text-center">
                      <Info className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p className="text-sm font-semibold text-slate-500">No matching actionable items</p>
                      <p className="text-xs text-slate-400 mt-1">Uncheck the "Actionable" filter to see all.</p>
                    </div>
                  ) : (
                    displayEmails.map((email) => {
                      const isSelected = selectedEmail?.id === email.id;
                      const isAnalyzing = !!analyzingIds[email.id];
                      const analysis = analysisResults.find(r => r.original_email.id === email.id);
                      
                      let badgeColor = "bg-slate-100 text-slate-600 border border-slate-200";
                      let priorityIndicator = null;
                      let dotColor = "bg-slate-400";

                      if (analysis) {
                        const score = analysis.analysis.step3.priority_score;
                        if (score === 5) {
                          badgeColor = "bg-red-50 text-red-700 border border-red-200/60";
                          priorityIndicator = "Critical Priority (5/5)";
                          dotColor = "bg-red-500 animate-pulse";
                        } else if (score === 4) {
                          badgeColor = "bg-orange-50 text-orange-700 border border-orange-200/60";
                          priorityIndicator = "High Priority (4/5)";
                          dotColor = "bg-orange-500";
                        } else if (score === 3) {
                          badgeColor = "bg-amber-50 text-amber-700 border border-amber-200/60";
                          priorityIndicator = "Medium Priority (3/5)";
                          dotColor = "bg-amber-500";
                        } else if (score === 2) {
                          badgeColor = "bg-yellow-50 text-yellow-800 border border-yellow-200/60";
                          priorityIndicator = "Low-Medium Priority (2/5)";
                          dotColor = "bg-yellow-500";
                        } else {
                          badgeColor = "bg-slate-50 text-slate-500 border border-slate-200/60";
                          priorityIndicator = "Low Priority (1/5)";
                          dotColor = "bg-slate-400";
                        }
                      }

                      return (
                        <div
                          key={email.id}
                          onClick={() => setSelectedEmail(email)}
                          className={`p-4 cursor-pointer transition-all flex gap-3 relative ${
                            isSelected 
                              ? "bg-indigo-50/60 border-l-4 border-indigo-600" 
                              : "hover:bg-slate-50 border-l-4 border-transparent"
                          }`}
                          id={`email-item-${email.id}`}
                        >
                          {/* Row Checkbox on Left Side */}
                          <div 
                            className="pt-0.5 flex items-start" 
                            onClick={(e) => {
                              e.stopPropagation(); // Avoid selecting email row when checking
                              setCheckedEmailIds(prev => 
                                prev.includes(email.id)
                                  ? prev.filter(id => id !== email.id)
                                  : [...prev, email.id]
                              );
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checkedEmailIds.includes(email.id)}
                              onChange={() => {}} // Controlled by outer wrapper's click for broader target
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                            />
                          </div>

                          {/* Email Content details on Right */}
                          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                            <div className="flex justify-between items-start gap-2">
                              <span className="text-[10px] font-bold text-slate-500 truncate max-w-[180px]" title={email.sender}>
                                {email.sender}
                              </span>
                              <div className="flex items-center gap-1.5">
                                {email.isCustom && (
                                  <span className="bg-indigo-100 text-indigo-700 text-[9px] font-bold px-1.5 py-0.5 rounded-sm">
                                    Simulated
                                  </span>
                                )}
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${email.processed ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800 animate-pulse"}`}>
                                  {email.processed ? "Processed" : "Unanalyzed"}
                                </span>
                              </div>
                            </div>

                            <h3 className="text-xs font-bold text-slate-800 line-clamp-1">
                              {email.subject}
                            </h3>

                            <p className="text-[11px] text-slate-400 line-clamp-2">
                              {email.body}
                            </p>

                            <div className="flex items-center justify-between mt-1">
                              <div className="flex items-center gap-1.5">
                                {priorityIndicator && (
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5 ${badgeColor}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
                                    {priorityIndicator}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {isAnalyzing && (
                                  <span className="text-[9px] text-indigo-600 font-bold flex items-center gap-1">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Analyzing...
                                  </span>
                                )}
                                <button
                                  onClick={(e) => handleDeleteEmail(email.id, e)}
                                  className="text-slate-300 hover:text-rose-500 p-1 rounded-sm transition-colors cursor-pointer"
                                  title="Delete message from workspace agent"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Selected Email details & Step-by-Step Reasoner Panel */}
            <div className="lg:col-span-7 flex flex-col gap-6" id="inbox-right-column">
              {selectedEmail ? (
                <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col min-h-[650px]" id="email-detail-panel">
                  
                  {/* Subject and body text viewport */}
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50" id="email-detail-header">
                    <div className="flex justify-between items-start gap-4 mb-4">
                      <div>
                        <h2 className="text-sm font-bold text-slate-800 mb-1" id="email-detail-subject">
                          {selectedEmail.subject}
                        </h2>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                          <span className="font-bold text-slate-400 uppercase tracking-wider">From:</span>
                          <span className="bg-slate-100 px-2 py-0.5 rounded-sm text-slate-600 font-mono">
                            {selectedEmail.sender}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => processEmails([selectedEmail])}
                        disabled={!!analyzingIds[selectedEmail.id]}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm disabled:bg-slate-200 disabled:text-slate-400 transition-all flex items-center gap-2 cursor-pointer shrink-0"
                        id="analyze-single-btn"
                      >
                        {analyzingIds[selectedEmail.id] ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            {selectedEmail.processed ? "Re-Analyze Email" : "Analyze & Take Action"}
                          </>
                        )}
                      </button>
                    </div>

                    <div className="bg-white p-4 rounded-lg border border-slate-200 text-xs text-slate-700 font-normal leading-relaxed whitespace-pre-wrap max-h-[160px] overflow-y-auto shadow-inner">
                      {selectedEmail.body}
                    </div>
                  </div>

                  {/* AI Reasoning Visualization Container */}
                  <div className="p-6 flex-1 bg-slate-50/20 flex flex-col" id="agent-reasoning-panel">
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
                        <Sparkles className="w-4 h-4 text-indigo-500" />
                        AI Agent Decision Reasoning Engine
                      </h3>
                      {selectedEmail.processed && (
                        <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-md">
                          Verified Gemini 3.5 Flash
                        </span>
                      )}
                    </div>

                    {!selectedEmail.processed ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-200 rounded-xl bg-white" id="analysis-pending-view">
                        <div className="bg-indigo-50 p-4 rounded-full text-indigo-500 mb-3 animate-pulse">
                          <Sparkles className="w-8 h-8" />
                        </div>
                        <h4 className="text-xs font-bold text-slate-700">Awaiting Agent Analysis</h4>
                        <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                          Click <strong>Analyze &amp; Take Action</strong> above to trigger the 5-step classification, urgency scoring, and automated tool pipeline.
                        </p>
                      </div>
                    ) : currentAnalysis ? (
                      <div className="space-y-4 flex-1 flex flex-col justify-between" id="agent-steps-container">
                        
                        <div className="space-y-4">
                          {/* STEP 1 */}
                          <div className="flex gap-3" id="reasoning-step-1">
                            <div className="flex flex-col items-center">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-xs ${
                                currentAnalysis.analysis.step1.action_needed 
                                  ? "bg-amber-500 text-white" 
                                  : "bg-slate-400 text-white"
                              }`}>
                                1
                              </div>
                              <div className="w-0.5 h-full bg-slate-200 min-h-[40px]"></div>
                            </div>
                            <div className="flex-1 bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 1: Is Action Needed?</span>
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-sm ${
                                  currentAnalysis.analysis.step1.action_needed 
                                    ? "bg-amber-100 text-amber-800" 
                                    : "bg-slate-100 text-slate-600"
                                }`}>
                                  {currentAnalysis.analysis.step1.action_needed ? "Action Required" : "Informational Only"}
                                </span>
                              </div>
                              <p className="text-xs text-slate-700 font-medium">
                                {currentAnalysis.analysis.step1.reason}
                              </p>
                            </div>
                          </div>

                          {/* STEP 2 */}
                          <div className="flex gap-3" id="reasoning-step-2">
                            <div className="flex flex-col items-center">
                              <div className="w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-xs">
                                2
                              </div>
                              <div className="w-0.5 h-full bg-slate-200 min-h-[40px]"></div>
                            </div>
                            <div className="flex-1 bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 2: Action Categorization</span>
                                <span className="bg-indigo-100 text-indigo-800 text-[9px] font-bold px-2 py-0.5 rounded-sm">
                                  {currentAnalysis.analysis.step2.category}
                                </span>
                              </div>
                              <p className="text-xs text-slate-700 font-medium">
                                Email classified into task archetype: <span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-[10px] font-semibold">{currentAnalysis.analysis.step2.category}</span>
                              </p>
                            </div>
                          </div>

                          {/* STEP 3 */}
                          <div className="flex gap-3" id="reasoning-step-3">
                            <div className="flex flex-col items-center">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-xs ${
                                currentAnalysis.analysis.step3.priority_score >= 4 
                                  ? "bg-rose-600 text-white" 
                                  : "bg-indigo-600 text-white"
                              }`}>
                                3
                              </div>
                              <div className="w-0.5 h-full bg-slate-200 min-h-[40px]"></div>
                            </div>
                            <div className="flex-1 bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 3: Priority &amp; Urgency Score</span>
                                <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full ${
                                  currentAnalysis.analysis.step3.priority_score >= 4 
                                    ? "bg-rose-100 text-rose-800" 
                                    : "bg-indigo-100 text-indigo-800"
                                }`}>
                                  Priority {currentAnalysis.analysis.step3.priority_score} / 5
                                </span>
                              </div>
                              <p className="text-xs text-slate-700 font-medium">
                                {currentAnalysis.analysis.step3.urgency_reason}
                              </p>
                            </div>
                          </div>

                          {/* STEP 4 */}
                          <div className="flex gap-3" id="reasoning-step-4">
                            <div className="flex flex-col items-center">
                              <div className="w-7 h-7 bg-emerald-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-xs">
                                4
                              </div>
                              <div className="w-0.5 h-full bg-slate-200 min-h-[40px]"></div>
                            </div>
                            <div className="flex-1 bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 4: Executed Automated Tool</span>
                                <span className="bg-emerald-100 text-emerald-800 text-[9px] font-mono font-bold px-2 py-0.5 rounded-sm">
                                  {currentAnalysis.analysis.step4.tool_name || "NONE"}
                                </span>
                              </div>
                              <div className="text-xs text-slate-700">
                                {currentAnalysis.analysis.step4.tool_name ? (
                                  <div className="space-y-2">
                                    <p className="font-semibold text-emerald-700 flex items-center gap-1">
                                      <CheckCircle className="w-3.5 h-3.5" />
                                      Auto-Triggered Tool Call: <span className="font-mono bg-slate-100 text-slate-800 px-1 py-0.5 rounded text-[10px]">{currentAnalysis.analysis.step4.tool_name}(...)</span>
                                    </p>
                                    <div className="bg-slate-50 p-2.5 rounded border border-slate-150 text-[10px] font-mono text-slate-600 overflow-x-auto whitespace-pre-wrap max-h-24">
                                      {JSON.stringify(currentAnalysis.analysis.step4.tool_args, null, 2)}
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-slate-500 italic">No automated tool execution required (Informational email).</p>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* STEP 5 */}
                          <div className="flex gap-3" id="reasoning-step-5">
                            <div className="flex flex-col items-center">
                              <div className="w-7 h-7 bg-indigo-900 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-xs">
                                5
                              </div>
                            </div>
                            <div className="flex-1 bg-indigo-950 p-3.5 rounded-lg border border-indigo-900 text-white shadow-2xs">
                              <span className="block text-[10px] font-bold text-indigo-300 uppercase tracking-wider mb-1">Step 5: Agent Executive Summary</span>
                              <p className="text-xs font-semibold italic text-indigo-50">
                                "{currentAnalysis.analysis.step5.one_line_summary}"
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Info className="w-3.5 h-3.5 text-indigo-500" />
                            This email has been fully mapped to the Action Center.
                          </span>
                          <button
                            onClick={() => setActiveTab("actions")}
                            className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            Go to Action Center
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>

                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-white border rounded-xl">
                        <AlertCircle className="w-8 h-8 text-rose-500 mb-2 animate-pulse" />
                        <p className="text-xs font-bold text-slate-700">Analysis Data Missing</p>
                        <p className="text-[11px] text-slate-400 mt-1">Please try re-processing this email.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col items-center justify-center text-center p-12 min-h-[650px]">
                  <Mail className="w-12 h-12 text-slate-300 mb-3 animate-pulse" />
                  <h3 className="text-sm font-bold text-slate-700">No Email Selected</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    Select an email from the left pane to view its content and access its AI agent reasoning dashboard.
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
        )}

        {/* TAB 2: ACTION CENTER & RANKED SUMMARIES */}
        {activeTab === "actions" && (
          <div className="space-y-8" id="actions-layout-container">
            
            {/* Top Dashboard Grid: Urgent Actions & Donut Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in" id="actions-top-dashboard-grid">
              
              {/* Left Column: Urgent Action Dashboard widget */}
              <div className="lg:col-span-8 flex flex-col h-full" id="urgent-actions-dashboard-col">
                <div className="bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-200 rounded-2xl p-5 shadow-xs flex-1 flex flex-col justify-between" id="urgent-actions-dashboard">
                  <div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-rose-200/60 pb-3 mb-4">
                      <div className="flex items-center gap-2.5">
                        <div className="bg-rose-500 text-white p-1.5 rounded-lg shadow-sm animate-pulse">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                            ⚡ Immediate Action Required (Priority 4 & 5)
                          </h3>
                          <p className="text-[11px] text-slate-500 font-medium">Critical drafts, meeting requests, and deadlines grouped for immediate dispatch</p>
                        </div>
                      </div>
                      <div className="bg-rose-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-xs">
                        {totalUrgentCount} items pending immediate review
                      </div>
                    </div>

                    {totalUrgentCount === 0 ? (
                      <div className="bg-white/80 backdrop-blur-xs p-6 rounded-xl border border-rose-100 text-center text-slate-500 text-xs font-semibold">
                        ✨ No high-priority items require immediate action. Your workspace is fully optimized!
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="urgent-items-grid">
                        {/* Urgent Drafts */}
                        {urgentDrafts.map((draft) => (
                          <div key={draft.id} className="bg-white p-4 rounded-xl border border-rose-200/70 shadow-3xs hover:shadow-2xs transition-all relative flex flex-col justify-between gap-3 overflow-hidden">
                            <div className="absolute top-0 right-0 bg-rose-500 text-white text-[8px] font-bold px-2 py-0.5 rounded-bl-lg uppercase tracking-wider">
                              Reply Draft (P{draft.priority})
                            </div>
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Draft Reply Required</span>
                              <h4 className="text-xs font-bold text-slate-800 line-clamp-1 mt-1">Re: {draft.subject}</h4>
                              <p className="text-[10px] text-slate-400 mt-0.5">To: {draft.sender}</p>
                              <div className="bg-rose-50/50 p-2 rounded-lg border border-rose-100/40 text-[10px] text-slate-600 font-medium italic mt-2 whitespace-pre-wrap max-h-20 overflow-y-auto">
                                {draft.reply}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 mt-1">
                              {isGmailMode ? (
                                <>
                                  <button
                                    onClick={() => handleExecuteGmailReply(draft, "draft")}
                                    className="flex-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[10px] font-bold py-1.5 rounded-lg transition-colors cursor-pointer"
                                  >
                                    Save Draft
                                  </button>
                                  <button
                                    onClick={() => handleExecuteGmailReply(draft, "send")}
                                    className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold py-1.5 rounded-lg transition-colors cursor-pointer"
                                  >
                                    Send Reply
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => {
                                    alert("Mock Confirmation:\nEmail draft approved and dispatched locally!");
                                    setDraftReplies(prev => prev.map(d => d.id === draft.id ? { ...d, sent: true } : d));
                                  }}
                                  className="w-full bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-3xs"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  Approve &amp; Send (Demo)
                                </button>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* Urgent Reminders */}
                        {urgentReminders.map((rem) => (
                          <div key={rem.id} className="bg-white p-4 rounded-xl border border-rose-200/70 shadow-3xs hover:shadow-2xs transition-all relative flex flex-col justify-between gap-3 overflow-hidden">
                            <div className="absolute top-0 right-0 bg-rose-500 text-white text-[8px] font-bold px-2 py-0.5 rounded-bl-lg uppercase tracking-wider">
                              Call/Meeting (P{rem.priority})
                            </div>
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Calendar Reminder</span>
                              <h4 className="text-xs font-bold text-slate-800 line-clamp-1 mt-1">{rem.title}</h4>
                              <p className="text-[10px] text-rose-600 font-mono font-bold mt-1 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {rem.suggestedTime}
                              </p>
                              {rem.notes && (
                                <div className="bg-slate-50 p-2 rounded border border-slate-150 text-[10px] text-slate-500 mt-2">
                                  <strong>Note:</strong> {rem.notes}
                                </div>
                              )}
                            </div>
                            
                            <button
                              onClick={() => toggleReminderCalendar(rem.id)}
                              className="w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[10px] font-bold py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
                            >
                              <Calendar className="w-3.5 h-3.5 text-rose-500" />
                              Add to Google Calendar
                            </button>
                          </div>
                        ))}

                        {/* Urgent Tasks */}
                        {urgentTasks.map((task) => (
                          <div key={task.id} className="bg-white p-4 rounded-xl border border-rose-200/70 shadow-3xs hover:shadow-2xs transition-all relative flex flex-col justify-between gap-3 overflow-hidden">
                            <div className="absolute top-0 right-0 bg-rose-500 text-white text-[8px] font-bold px-2 py-0.5 rounded-bl-lg uppercase tracking-wider">
                              Urgent Task (P{task.priority})
                            </div>
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deadline Task</span>
                              <h4 className="text-xs font-bold text-slate-800 leading-snug mt-1 line-clamp-2">{task.description}</h4>
                              <p className="text-[10px] text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-sm inline-block mt-2">
                                Due: {task.deadline}
                              </p>
                            </div>
                            
                            <button
                              onClick={() => toggleTaskCompleted(task.id)}
                              className="w-full bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-3xs"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Mark as Completed
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Urgency Distribution Donut Chart visualizer card */}
              <div className="lg:col-span-4" id="urgency-distribution-chart-col">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between h-full min-h-[380px]" id="urgency-distribution-chart-card">
                  <div>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                          <CheckCircle className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Urgency Breakdown</h4>
                          <p className="text-[10px] text-slate-400 font-medium">Action items categorized by priority score</p>
                        </div>
                      </div>
                    </div>

                    {/* Filter Selector Buttons */}
                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/55 mb-4 max-w-fit" id="chart-filter-selectors">
                      {(["all", "pending", "completed"] as const).map((filter) => (
                        <button
                          key={filter}
                          onClick={() => setChartFilter(filter)}
                          className={`text-[10px] font-bold px-3 py-1 rounded-md transition-all cursor-pointer capitalize ${
                            chartFilter === filter
                              ? "bg-white text-slate-800 shadow-3xs"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {filter}
                        </button>
                      ))}
                    </div>

                    {/* Recharts Donut canvas wrapper with absolute centered text label */}
                    <div className="relative flex items-center justify-center min-h-[160px]" id="donut-chart-canvas-wrapper">
                      {/* Absolute center label */}
                      <div className="absolute flex flex-col items-center justify-center text-center pointer-events-none">
                        <span className="text-2xl font-black text-slate-800 font-sans tracking-tight leading-none">
                          {totalChartItems}
                        </span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                          Actions
                        </span>
                      </div>

                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie
                            data={chartData.length > 0 ? chartData : [{ name: "No Actions", value: 1, color: "#e2e8f0" }]}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={65}
                            paddingAngle={chartData.length > 1 ? 4 : 0}
                            dataKey="value"
                          >
                            {(chartData.length > 0 ? chartData : [{ color: "#e2e8f0" }]).map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={(entry as any).color} stroke="#ffffff" strokeWidth={1.5} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                if (data.name === "No Actions") return null;
                                return (
                                  <div className="bg-slate-900/95 backdrop-blur-xs text-white px-2.5 py-1.5 rounded-lg text-[10px] font-semibold shadow-lg border border-slate-800 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: data.color }}></span>
                                    <span>{data.name}: <strong>{data.value}</strong></span>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* List Legend with dynamic counts */}
                  <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] font-medium text-slate-500 border-t border-slate-100 pt-3" id="donut-chart-legend">
                    {[
                      { key: 5, label: "Critical (P5)", color: "#ef4444" },
                      { key: 4, label: "High (P4)", color: "#f97316" },
                      { key: 3, label: "Medium (P3)", color: "#f59e0b" },
                      { key: 2, label: "Low-Med (P2)", color: "#eab308" },
                      { key: 1, label: "Low (P1)", color: "#94a3b8" }
                    ].map(item => {
                      const count = (legendCounts as any)[item.key] || 0;
                      return (
                        <div key={item.key} className="flex items-center justify-between p-1 rounded-md hover:bg-slate-50 transition-all">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }}></span>
                            <span className="truncate text-slate-600 font-semibold">{item.label}</span>
                          </div>
                          <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded-sm text-[9px]">{count}</span>
                        </div>
                      );
                    })}
                  </div>

                </div>
              </div>

            </div>
            
            {/* Consolidated Priority Summary Pane */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden" id="ranked-summaries-panel">
              <div className="p-4 border-b border-slate-100 bg-indigo-50/20 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Consolidated Priority Summary (Ranked Highest Urgency First)
                  </h3>
                </div>
                <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-sm">
                  {rankedSummaries.length} analyzed items
                </span>
              </div>

              <div className="divide-y divide-slate-100" id="ranked-summaries-list">
                {rankedSummaries.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs italic">
                    Inbox has not been processed yet. Go back to the "Inbox" tab and click "Analyze Entire Inbox" to see ranked summaries.
                  </div>
                ) : (
                  rankedSummaries.map((res, index) => {
                    const score = res.analysis.step3.priority_score;
                    let pColor = "text-slate-500 bg-slate-50 border-slate-200";
                    if (score === 5) pColor = "text-rose-700 bg-rose-50 border-rose-200 font-bold";
                    else if (score === 4) pColor = "text-orange-700 bg-orange-50 border-orange-200 font-bold";
                    else if (score === 3) pColor = "text-amber-700 bg-amber-50 border-amber-200";
                    else if (score === 2) pColor = "text-blue-700 bg-blue-50 border-blue-200";

                    return (
                      <div 
                        key={res.id} 
                        className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/30 transition-colors"
                        id={`ranked-item-${res.id}`}
                      >
                        <div className="flex items-start gap-3 flex-1">
                          <span className="text-[10px] text-slate-400 font-bold font-mono mt-0.5">
                            #{index + 1}
                          </span>
                          <div>
                            <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-sm mr-2 border ${pColor}`}>
                              Priority {score}
                            </span>
                            <span className="text-xs font-bold text-slate-500 font-mono mr-2">[{res.analysis.step2.category}]</span>
                            <p className="text-xs text-slate-800 font-bold mt-1">"{res.analysis.step5.one_line_summary}"</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">From {res.original_email.sender} &bull; Subject: {res.original_email.subject}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedEmail(res.original_email);
                            setActiveTab("inbox");
                          }}
                          className="border border-slate-200 hover:bg-slate-50 text-[10px] font-bold py-1.5 px-3 rounded-md transition-colors cursor-pointer text-slate-600 shrink-0 self-start md:self-center"
                        >
                          View Reasoner
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Action pipelines based on classification types */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="action-center-columns">
              
              {/* Pipeline 1: REPLY_NEEDED */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col" id="replies-pipeline-card">
                <div className="p-4 border-b border-slate-100 bg-blue-50/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-blue-600" />
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Reply Drafts Required</h4>
                  </div>
                  <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {draftReplies.filter(d => !d.sent).length} pending
                  </span>
                </div>

                <div className="p-4 flex-1 space-y-4 max-h-[500px] overflow-y-auto">
                  {draftReplies.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs italic">
                      No draft replies requested or generated.
                    </div>
                  ) : (
                    draftReplies.map((draft) => (
                      <div key={draft.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-2 relative">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-500 font-mono truncate max-w-[120px]">{draft.sender}</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-sm ${draft.sent ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>
                            {draft.sent ? "Sent / Synced" : `Priority ${draft.priority}`}
                          </span>
                        </div>
                        <h5 className="text-xs font-bold text-slate-800 line-clamp-1">Re: {draft.subject}</h5>
                        
                        <div className="bg-white p-2.5 rounded border border-slate-150 text-[11px] text-slate-600 italic whitespace-pre-wrap max-h-24 overflow-y-auto">
                          {draft.reply}
                        </div>

                        {!draft.sent && (
                          <div className="flex items-center gap-2 mt-1">
                            {isGmailMode ? (
                              <>
                                <button
                                  onClick={() => handleExecuteGmailReply(draft, "draft")}
                                  className="flex-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[10px] font-bold py-1.5 rounded-lg shadow-2xs transition-colors cursor-pointer"
                                >
                                  Save Draft
                                </button>
                                <button
                                  onClick={() => handleExecuteGmailReply(draft, "send")}
                                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold py-1.5 rounded-lg shadow-xs transition-colors cursor-pointer"
                                >
                                  Send Reply
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => {
                                  alert("Mock Confirmation:\nEmail draft marked as approved and dispatched locally!");
                                  setDraftReplies(prev => prev.map(d => d.id === draft.id ? { ...d, sent: true } : d));
                                }}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold py-1.5 rounded-lg shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Approve &amp; Send (Demo)
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Pipeline 2: MEETING_REQUEST */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col" id="reminders-pipeline-card">
                <div className="p-4 border-b border-slate-100 bg-amber-50/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-600" />
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Meeting Reminders</h4>
                  </div>
                  <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {reminders.filter(r => !r.addedToCalendar).length} pending
                  </span>
                </div>

                <div className="p-4 flex-1 space-y-4 max-h-[500px] overflow-y-auto">
                  {reminders.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs italic">
                      No meeting/call reminders created.
                    </div>
                  ) : (
                    reminders.map((rem) => (
                      <div key={rem.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-500" />
                            {rem.suggestedTime}
                          </span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-sm ${rem.addedToCalendar ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                            {rem.addedToCalendar ? "In Calendar" : `Priority ${rem.priority}`}
                          </span>
                        </div>
                        <h5 className="text-xs font-bold text-slate-800">{rem.title}</h5>
                        {rem.notes && (
                          <p className="text-[10px] text-slate-500 font-medium leading-relaxed bg-white p-2 rounded border border-slate-150">
                            <strong>Note:</strong> {rem.notes}
                          </p>
                        )}

                        {!rem.addedToCalendar && (
                          <button
                            onClick={() => toggleReminderCalendar(rem.id)}
                            className="w-full mt-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[10px] font-bold py-1.5 rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center justify-center gap-1"
                          >
                            <Calendar className="w-3.5 h-3.5 text-amber-500" />
                            Add to Google Calendar
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Pipeline 3: DEADLINE_TASK & APPROVAL_NEEDED */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col" id="tasks-pipeline-card">
                <div className="p-4 border-b border-slate-100 bg-emerald-50/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-emerald-600" />
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">To-Do List Backlog</h4>
                  </div>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {tasks.filter(t => !t.completed).length} items
                  </span>
                </div>

                <div className="p-4 flex-1 space-y-4 max-h-[500px] overflow-y-auto">
                  {tasks.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs italic">
                      No logged tasks or approval requests.
                    </div>
                  ) : (
                    tasks.map((task) => (
                      <div key={task.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-sm">
                            Due: {task.deadline}
                          </span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-sm ${task.completed ? "bg-emerald-100 text-emerald-800" : "bg-indigo-100 text-indigo-800"}`}>
                            {task.completed ? "Completed" : `Priority ${task.priority}`}
                          </span>
                        </div>
                        <p className={`text-xs font-semibold leading-snug ${task.completed ? "line-through text-slate-400" : "text-slate-800"}`}>
                          {task.description}
                        </p>

                        <button
                          onClick={() => toggleTaskCompleted(task.id)}
                          className={`w-full mt-1 border text-[10px] font-bold py-1.5 rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                            task.completed 
                              ? "bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200" 
                              : "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent"
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                          {task.completed ? "Mark as Active" : "Mark as Completed"}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

      </main>

      <footer className="bg-white border-t border-slate-200 py-6 mt-12" id="app-footer">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs text-slate-400 font-medium">Smart Inbox-to-Action Agent &bull; Securely powered by Gemini AI API and Firebase Google OAuth</p>
          <p className="text-[10px] text-slate-300 font-mono mt-1">Version 1.2.0 &bull; 0.0.0.0:3000 Ingress Routing Mode</p>
        </div>
      </footer>

      {/* Toast Notification for High-Priority Alert */}
      {activeToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-slate-900 text-white rounded-2xl shadow-xl border border-slate-800 p-4 animate-slide-in flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-rose-500 rounded-lg text-white">
                <Bell className="w-4 h-4 animate-swing" />
              </span>
              <div>
                <span className="text-[9px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-sm uppercase tracking-wider">
                  Important (Priority {activeToast.priority})
                </span>
                <span className="text-[9px] text-slate-400 font-medium block mt-0.5">{activeToast.category}</span>
              </div>
            </div>
            <button 
              onClick={() => setActiveToast(null)}
              className="text-slate-400 hover:text-white text-sm cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div>
            <h4 className="text-xs font-bold text-white line-clamp-1">{activeToast.subject}</h4>
            <p className="text-[10px] text-slate-400 truncate mt-0.5">From: {activeToast.sender}</p>
            <p className="text-xs text-indigo-200 bg-slate-800/60 p-2.5 rounded border border-slate-700/40 mt-2 font-medium italic">
              "{activeToast.oneLineSummary}"
            </p>
          </div>

          <div className="flex items-center gap-2 justify-end mt-1">
            <button
              onClick={() => {
                const matchedEmail = emails.find(e => e.id === activeToast.emailId);
                if (matchedEmail) {
                  setSelectedEmail(matchedEmail);
                  setActiveTab("inbox");
                }
                setActiveToast(null);
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
            >
              Action Center
            </button>
            <button
              onClick={() => setActiveToast(null)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

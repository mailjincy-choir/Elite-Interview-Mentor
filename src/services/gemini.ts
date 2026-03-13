import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Please add it to your secrets.");
  }
  return new GoogleGenAI({ apiKey });
};

export const MODEL_NAME = "gemini-3-flash-preview";
export const PRO_MODEL_NAME = "gemini-3.1-pro-preview";

export interface CandidateInfo {
  resume: string;
  jobDescription: string;
  companyName: string;
  roleTitle: string;
  experienceLevel: string;
  interviewType: string;
}

export async function analyzeRoleFit(info: CandidateInfo) {
  const ai = getAI();
  try {
    // Truncate inputs to prevent extreme length issues while keeping essential info
    const maxChars = 15000;
    const truncatedResume = info.resume.length > maxChars 
      ? info.resume.substring(0, maxChars) + "... [truncated]" 
      : info.resume;
    const truncatedJD = info.jobDescription.length > maxChars 
      ? info.jobDescription.substring(0, maxChars) + "... [truncated]" 
      : info.jobDescription;

    const prompt = `
      Analyze the following candidate information against the job description.
      
      Company: ${info.companyName}
      Role: ${info.roleTitle}
      Experience Level: ${info.experienceLevel}
      Interview Type: ${info.interviewType}
      
      Job Description:
      ${truncatedJD}
      
      Candidate Resume/Experience:
      ${truncatedResume}
      
      Provide a detailed "Role Fit Analysis Report" in JSON format with the following structure:
      {
        "keyCompetencies": ["string"],
        "strengths": ["string"],
        "potentialGaps": ["string"],
        "focusAreas": ["string"],
        "predictedQuestions": {
          "behavioral": ["string"],
          "roleSpecific": ["string"],
          "companySpecific": ["string"]
        }
      }
      Extract 4-6 core competencies. Identify 3-5 strengths and 3-5 gaps. Recommend focus areas.
      Predict 3-5 likely questions for each category.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from AI model");
    }

    return JSON.parse(text);
  } catch (error: any) {
    console.error("Error in analyzeRoleFit:", error);
    
    // Handle specific API errors
    const errorMessage = error?.message || "";
    
    if (errorMessage.includes("API_KEY_INVALID")) {
      throw new Error("Invalid API Key. Please check your GEMINI_API_KEY configuration.");
    }
    
    if (errorMessage.includes("QUOTA_EXCEEDED") || errorMessage.includes("429")) {
      throw new Error("Rate limit exceeded. Please wait a moment and try again.");
    }

    if (errorMessage.includes("SAFETY")) {
      throw new Error("The content was flagged by safety filters. Please ensure your resume and job description contain professional content.");
    }

    throw new Error(`Analysis failed: ${error instanceof Error ? error.message : "Unknown error"}. Please try with a slightly shorter resume or job description.`);
  }
}

export async function getNextInterviewQuestion(
  info: CandidateInfo,
  history: { role: string; content: string }[]
) {
  const ai = getAI();
  try {
    const systemInstruction = `
      You are an Elite Interviewer with 10+ years of experience at top companies like ${info.companyName}. 
      Your goal is to determine if the candidate is a suitable fit for the role of ${info.roleTitle}.
      
      Rules for your behavior:
      1. **Be Concise**: Real interviewers are brief. Avoid long preambles or lecture-like explanations. Get straight to the point.
      2. **No Feedback During Interview**: Do NOT comment on the quality of the candidate's answers (e.g., avoid "Great answer", "That's correct", or "You could be more specific"). Save all evaluations for the final report.
      3. **Probe for Insights**: Focus entirely on deriving insights and testing for role fit. If an answer is interesting, dig deeper. If it's incomplete, probe for the missing pieces without judging the candidate's performance out loud.
      4. **One Thing at a Time**: Never ask double-barreled questions. Ask one specific thing, wait for the answer, then follow up.
      5. **Challenge Vague Responses**: If the candidate is being generic or avoiding specifics, call it out professionally. "That's a bit high-level. Can you walk me through the exact steps you took?"
      6. **Adaptive Escalation**: 
         - If the answer is weak: Drill down into the missing details.
         - If the answer is strong: Escalate the challenge. "How would that scale if we had 10x users?" or "What if the budget was cut by 50% mid-project?"
      7. **Curveballs**: Occasionally ask a "why not" or "what if" question that tests their first-principles reasoning or product intuition under pressure.
      8. **Decision Clarity & Pacing**: 
         - You MUST ask at least 5 questions before considering a conclusion.
         - After the 5th question, if you have reached a high level of clarity on the hiring decision (Strong Hire or Strong No Hire) after thoroughly testing relevant aspects, do not ask another question. 
         - In this case, provide a brief, professional closing statement (e.g., 'Thank you for your time today. I have all the information I need for now. We will be in touch.') and end your response with the exact token: [INTERVIEW_END].
      9. **Maximum Limit**: You have a maximum of 15 questions to gather enough evidence for a hiring decision and detailed feedback. Pace yourself accordingly to ensure you cover all critical competencies.
      
      Interview Context:
      - Company: ${info.companyName}
      - Role: ${info.roleTitle}
      - Interview Type: ${info.interviewType}
      
      If this is the start: Introduce yourself (max 10 words) and ask the first broad question.
      If the candidate just answered: Acknowledge briefly (e.g., "Got it.", "Interesting.") and ask the next focused question or follow-up.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: history.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })),
      config: {
        systemInstruction,
      },
    });

    return response.text;
  } catch (error) {
    console.error("Error in getNextInterviewQuestion:", error);
    return "I'm sorry, I'm having trouble connecting. Could you please check your internet connection or API key configuration?";
  }
}

export async function generateFinalEvaluation(
  info: CandidateInfo,
  history: { role: string; content: string }[]
) {
  const ai = getAI();
  try {
    const prompt = `
      Based on the following mock interview transcript, provide a comprehensive, high-stakes evaluation as if you were the Hiring Manager at ${info.companyName}.
      
      Candidate Info:
      Company: ${info.companyName}
      Role: ${info.roleTitle}
      Interview Type: ${info.interviewType}
      
      Transcript:
      ${history.map(h => `${h.role === 'user' ? 'Candidate' : 'Interviewer'}: ${h.content}`).join('\n')}
      
      Your goal is to provide the candidate with the exact insights they need to crack the real interview. 
      Be brutally honest but constructive. Connect every piece of feedback to specific moments in the transcript.
      
      Provide a structured evaluation report in JSON format:
      {
        "scorecard": {
          "communication": 1-5,
          "problemSolving": 1-5,
          "leadership": 1-5,
          "ownership": 1-5,
          "impactOrientation": 1-5,
          "confidence": 1-5,
          "roleFit": 1-5
        },
        "hiringManagerImpression": "A 2-3 sentence summary of how the hiring manager perceived the candidate's overall performance and potential.",
        "whatWentWell": ["Specific strengths demonstrated, citing transcript examples."],
        "whatCouldBeImproved": ["Specific weaknesses or missed cues, citing transcript examples."],
        "missedOpportunities": ["Specific points where the candidate could have elaborated or used a better framework (e.g. STAR, CAR)."],
        "gapAnalysis": ["The delta between the candidate's current performance and the expectations for a ${info.experienceLevel} ${info.roleTitle} at ${info.companyName}."],
        "improvementPlan": [
          { 
            "area": "Competency name", 
            "weakness": "Description of the observed weakness", 
            "actions": ["3-5 highly specific, actionable steps to improve this before the real interview"] 
          }
        ],
        "actionPlan3Day": [
          "Day 1: Specific focus (e.g. 'Refine the STAR story for the conflict resolution question')",
          "Day 2: Specific focus (e.g. 'Deep dive into ${info.companyName}'s engineering blog on system architecture')",
          "Day 3: Specific focus (e.g. 'Mock session focusing purely on brevity and impact metrics')"
        ],
        "learningResources": [
          { 
            "title": "Highly specific and reliable resource title (e.g. 'Mastering System Design at ${info.companyName}' or 'Product Strategy deep dive from Lenny's Podcast')", 
            "url": "A real, verified, and high-quality URL (e.g. official documentation, top-tier engineering blogs, reputed YouTube channels like @LennysPodcast or @growproduct, or platforms like LeetCode)", 
            "type": "free | paid" 
          }
        ]
      }
      
      CRITICAL: The "learningResources" MUST be highly relevant to the specific weaknesses identified in the "improvementPlan". Prioritize official company engineering blogs, high-quality technical documentation, industry-standard interview prep platforms, and specific relevant videos from reputed YouTube channels (e.g. Lenny's Podcast, Grow Product). Ensure all URLs are real and functional.
      
      Ensure the feedback is so helpful that the candidate feels significantly more prepared for the actual interview at ${info.companyName}.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
      },
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Error in generateFinalEvaluation:", error);
    throw new Error("Evaluation failed. This can happen if the interview transcript is too long. Please try a shorter session.");
  }
}

export async function transcribeAudio(base64Audio: string, mimeType: string) {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          parts: [
            {
              inlineData: {
                data: base64Audio,
                mimeType: mimeType,
              },
            },
            {
              text: "Transcribe the following audio exactly as spoken. Provide only the transcription text.",
            },
          ],
        },
      ],
    });

    return response.text;
  } catch (error) {
    console.error("Error in transcribeAudio:", error);
    throw new Error("Transcription failed. Please check your microphone and try again.");
  }
}

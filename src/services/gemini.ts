import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenAI({ apiKey });

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
  try {
    const prompt = `
      Analyze the following candidate information against the job description.
      
      Company: ${info.companyName}
      Role: ${info.roleTitle}
      Experience Level: ${info.experienceLevel}
      Interview Type: ${info.interviewType}
      
      Job Description:
      ${info.jobDescription}
      
      Candidate Resume/Experience:
      ${info.resume}
      
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

    const response = await genAI.models.generateContent({
      model: MODEL_NAME,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
      },
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Error in analyzeRoleFit:", error);
    throw new Error("The analysis is taking longer than expected or failed. Please try with a shorter resume or job description.");
  }
}

export async function getNextInterviewQuestion(
  info: CandidateInfo,
  history: { role: string; content: string }[]
) {
  try {
    const systemInstruction = `
      You are an Elite Interviewer with 10+ years of experience at top companies like ${info.companyName}. 
      Your goal is to determine if the candidate is a suitable fit for the role of ${info.roleTitle}.
      
      Rules for your behavior:
      1. **Be Concise**: Real interviewers are brief. Avoid long preambles or lecture-like explanations. Get straight to the point.
      2. **One Thing at a Time**: Never ask double-barreled questions. Ask one specific thing, wait for the answer, then follow up.
      3. **Challenge Vague Responses**: If the candidate is being generic or avoiding specifics, call it out. "That's a bit high-level. Can you walk me through the exact steps you took?"
      4. **Adaptive Escalation**: 
         - If the answer is weak: Drill down into the missing details.
         - If the answer is strong: Escalate the challenge. "How would that scale if we had 10x users?" or "What if the budget was cut by 50% mid-project?"
      5. **Curveballs**: Occasionally ask a "why not" or "what if" question that tests their first-principles reasoning or product intuition under pressure.
      7. **Pacing**: You have a maximum of 15 questions to gather enough evidence for a hiring decision and detailed feedback. Pace yourself accordingly.
      
      Interview Context:
      - Company: ${info.companyName}
      - Role: ${info.roleTitle}
      - Interview Type: ${info.interviewType}
      
      If this is the start: Introduce yourself (max 10 words) and ask the first broad question.
      If the candidate just answered: Acknowledge briefly (e.g., "Got it.", "Interesting.") and ask the next focused question or follow-up.
    `;

    const response = await genAI.models.generateContent({
      model: MODEL_NAME,
      contents: history.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })),
      config: {
        systemInstruction,
      },
    });

    return response.text;
  } catch (error) {
    console.error("Error in getNextInterviewQuestion:", error);
    return "I'm sorry, I'm having trouble connecting. Could you please repeat your last point or try again in a moment?";
  }
}

export async function generateFinalEvaluation(
  info: CandidateInfo,
  history: { role: string; content: string }[]
) {
  try {
    const prompt = `
      Based on the following mock interview transcript, provide a comprehensive evaluation.
      
      Candidate Info:
      Company: ${info.companyName}
      Role: ${info.roleTitle}
      
      Transcript:
      ${history.map(h => `${h.role === 'user' ? 'Candidate' : 'Interviewer'}: ${h.content}`).join('\n')}
      
      Provide a structured evaluation report in JSON format. 
      CRITICAL: In "whatWentWell" and "whatCouldBeImproved", connect your feedback directly to specific answers or moments in the interview. 
      Example: "Your answer about the SIP journey demonstrated strong product thinking but could have included more details about technical collaboration."
      
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
        "hiringManagerImpression": "string",
        "whatWentWell": ["string"],
        "whatCouldBeImproved": ["string"],
        "missedOpportunities": ["string"],
        "gapAnalysis": ["string"],
        "improvementPlan": [
          { "area": "string", "weakness": "string", "actions": ["string"] }
        ],
        "actionPlan3Day": ["string"],
        "learningResources": [
          { "title": "string", "url": "string", "type": "free | paid" }
        ]
      }
      Extract 4-6 core competencies. Identify 3-5 strengths and 3-5 gaps. Recommend focus areas.
      Predict 3-5 likely questions for each category.
      For learning resources, provide actual URLs to books, courses, or articles.
    `;

    const response = await genAI.models.generateContent({
      model: MODEL_NAME,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
      },
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Error in generateFinalEvaluation:", error);
    throw new Error("Evaluation failed. This can happen if the interview transcript is too long or complex. Please try a shorter session.");
  }
}

export async function transcribeAudio(base64Audio: string, mimeType: string) {
  try {
    const response = await genAI.models.generateContent({
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
    throw new Error("Transcription failed.");
  }
}

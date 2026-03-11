/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  User, 
  Briefcase, 
  Building2, 
  Target, 
  ChevronRight, 
  CheckCircle2, 
  MessageSquare, 
  BarChart3, 
  BookOpen, 
  RefreshCw,
  Send,
  Loader2,
  Award,
  AlertCircle,
  ArrowRight,
  Mic,
  MicOff,
  ExternalLink
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Markdown from 'react-markdown';
import { 
  CandidateInfo, 
  analyzeRoleFit, 
  getNextInterviewQuestion, 
  generateFinalEvaluation,
  transcribeAudio 
} from './services/gemini';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Step = 'collect' | 'analysis' | 'interview' | 'evaluation';

export default function App() {
  const [step, setStep] = useState<Step>('collect');
  const [info, setInfo] = useState<CandidateInfo>({
    resume: '',
    jobDescription: '',
    companyName: '',
    roleTitle: '',
    experienceLevel: '',
    interviewType: 'behavioral'
  });
  const [analysis, setAnalysis] = useState<any>(null);
  const [interviewHistory, setInterviewHistory] = useState<{ role: 'user' | 'model'; content: string }[]>([]);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Mentor is thinking...');
  const [userInput, setUserInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const loadingMessages = [
    'Mentor is thinking...',
    'Analyzing your response...',
    'Preparing the next question...',
    'Evaluating your performance...',
    'Reviewing job requirements...',
    'Synthesizing feedback...'
  ];

  useEffect(() => {
    let interval: any;
    if (loading) {
      let i = 0;
      interval = setInterval(() => {
        i = (i + 1) % loadingMessages.length;
        setLoadingMessage(loadingMessages[i]);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interviewHistory]);

  const handleStartAnalysis = async () => {
    const errors: Record<string, string> = {};
    if (!info.companyName) errors.companyName = 'Company Name is required';
    if (!info.roleTitle) errors.roleTitle = 'Role Title is required';
    if (!info.experienceLevel) errors.experienceLevel = 'Experience Level is required';
    if (!info.resume) errors.resume = 'Resume is required';
    if (!info.jobDescription) errors.jobDescription = 'Job Description is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setLoading(true);
    try {
      const result = await analyzeRoleFit(info);
      setAnalysis(result);
      setStep('analysis');
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Failed to analyze role fit. Please try again.';
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartInterview = async () => {
    setLoading(true);
    setStep('interview');
    try {
      const firstQuestion = `Welcome! I'm your interviewer today. It's a pleasure to meet you. To get us started, could you please tell me a bit about yourself and share what motivated you to apply for the ${info.roleTitle} position at ${info.companyName}?`;
      setInterviewHistory([{ role: 'model', content: firstQuestion }]);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (textOverride?: string) => {
    const messageContent = textOverride || userInput;
    if (!messageContent.trim() || loading) return;
    
    const newHistory = [...interviewHistory, { role: 'user' as const, content: messageContent }];
    setInterviewHistory(newHistory);
    setUserInput('');
    setLoading(true);
    setLoadingMessage('Mentor is thinking...');

    try {
      if (newHistory.filter(h => h.role === 'user').length >= 15) {
        // End interview and evaluate
        setLoadingMessage('Synthesizing final evaluation...');
        const evalResult = await generateFinalEvaluation(info, newHistory);
        setEvaluation(evalResult);
        setStep('evaluation');
      } else {
        const nextQ = await getNextInterviewQuestion(info, newHistory);
        if (nextQ?.includes('[INTERVIEW_END]')) {
          const cleanQ = nextQ.replace('[INTERVIEW_END]', '').trim();
          const finalHistory: { role: 'user' | 'model'; content: string }[] = [...newHistory, { role: 'model', content: cleanQ }];
          setInterviewHistory(finalHistory);
          setLoadingMessage('Synthesizing final evaluation...');
          const evalResult = await generateFinalEvaluation(info, finalHistory);
          setEvaluation(evalResult);
          setStep('evaluation');
        } else {
          setInterviewHistory([...newHistory, { role: 'model', content: nextQ || '' }]);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          setLoading(true);
          setLoadingMessage('Transcribing your response...');
          try {
            const transcription = await transcribeAudio(base64Audio, 'audio/webm');
            if (transcription) {
              handleSendMessage(transcription);
            }
          } catch (error) {
            console.error(error);
            alert('Transcription failed. Please try typing or recording again.');
          } finally {
            setLoading(false);
          }
        };
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleEndInterviewEarly = async () => {
    setLoading(true);
    setLoadingMessage('Synthesizing final evaluation...');
    try {
      const evalResult = await generateFinalEvaluation(info, interviewHistory);
      setEvaluation(evalResult);
      setStep('evaluation');
    } catch (error) {
      console.error(error);
      alert('Evaluation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderCollect = () => (
    <div className="max-w-4xl mx-auto p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900">Elite Interview Mentor AI</h1>
        <p className="text-lg text-zinc-600">Your senior interview coach with 10+ years of experience at top tech companies.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-zinc-700 flex items-center gap-2">
            <Building2 className="w-4 h-4" /> Company Name <span className="text-red-500">*</span>
          </label>
          <input 
            type="text" 
            placeholder="e.g. Google, Stripe, Airbnb"
            className={cn(
              "w-full p-3 rounded-xl border focus:ring-2 focus:ring-indigo-500 outline-none transition-all",
              formErrors.companyName ? "border-red-500 bg-red-50" : "border-zinc-200"
            )}
            value={info.companyName}
            onChange={e => {
              setInfo({...info, companyName: e.target.value});
              if (formErrors.companyName) setFormErrors({...formErrors, companyName: ''});
            }}
          />
          {formErrors.companyName && <p className="text-xs text-red-500 mt-1">{formErrors.companyName}</p>}
        </div>
        <div className="space-y-4">
          <label className="block text-sm font-medium text-zinc-700 flex items-center gap-2">
            <Briefcase className="w-4 h-4" /> Role Title <span className="text-red-500">*</span>
          </label>
          <input 
            type="text" 
            placeholder="e.g. Senior Software Engineer"
            className={cn(
              "w-full p-3 rounded-xl border focus:ring-2 focus:ring-indigo-500 outline-none transition-all",
              formErrors.roleTitle ? "border-red-500 bg-red-50" : "border-zinc-200"
            )}
            value={info.roleTitle}
            onChange={e => {
              setInfo({...info, roleTitle: e.target.value});
              if (formErrors.roleTitle) setFormErrors({...formErrors, roleTitle: ''});
            }}
          />
          {formErrors.roleTitle && <p className="text-xs text-red-500 mt-1">{formErrors.roleTitle}</p>}
        </div>
        <div className="space-y-4">
          <label className="block text-sm font-medium text-zinc-700 flex items-center gap-2">
            <Target className="w-4 h-4" /> Experience Level <span className="text-red-500">*</span>
          </label>
          <select 
            className={cn(
              "w-full p-3 rounded-xl border focus:ring-2 focus:ring-indigo-500 outline-none transition-all",
              formErrors.experienceLevel ? "border-red-500 bg-red-50" : "border-zinc-200"
            )}
            value={info.experienceLevel}
            onChange={e => {
              setInfo({...info, experienceLevel: e.target.value});
              if (formErrors.experienceLevel) setFormErrors({...formErrors, experienceLevel: ''});
            }}
          >
            <option value="">Select Level</option>
            <option value="Entry">Entry Level</option>
            <option value="Mid">Mid Level</option>
            <option value="Senior">Senior Level</option>
            <option value="Staff/Principal">Staff / Principal</option>
            <option value="Manager">Manager / Director</option>
          </select>
          {formErrors.experienceLevel && <p className="text-xs text-red-500 mt-1">{formErrors.experienceLevel}</p>}
        </div>
        <div className="space-y-4">
          <label className="block text-sm font-medium text-zinc-700 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Interview Type
          </label>
          <select 
            className="w-full p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            value={info.interviewType}
            onChange={e => setInfo({...info, interviewType: e.target.value})}
          >
            <option value="behavioral">Behavioral</option>
            <option value="technical">Technical</option>
            <option value="system design">System Design</option>
            <option value="product">Product</option>
            <option value="mixed mock interview">Mixed Mock Interview</option>
          </select>
        </div>
      </div>

      <div className="space-y-6">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-zinc-700">Resume or Summary of Experience <span className="text-red-500">*</span></label>
          <textarea 
            rows={6}
            placeholder="Paste your resume or a detailed summary of your career highlights..."
            className={cn(
              "w-full p-4 rounded-xl border focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none",
              formErrors.resume ? "border-red-500 bg-red-50" : "border-zinc-200"
            )}
            value={info.resume}
            onChange={e => {
              setInfo({...info, resume: e.target.value});
              if (formErrors.resume) setFormErrors({...formErrors, resume: ''});
            }}
          />
          {formErrors.resume && <p className="text-xs text-red-500 mt-1">{formErrors.resume}</p>}
        </div>
        <div className="space-y-4">
          <label className="block text-sm font-medium text-zinc-700">Job Description <span className="text-red-500">*</span></label>
          <textarea 
            rows={6}
            placeholder="Paste the full job description here..."
            className={cn(
              "w-full p-4 rounded-xl border focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none",
              formErrors.jobDescription ? "border-red-500 bg-red-50" : "border-zinc-200"
            )}
            value={info.jobDescription}
            onChange={e => {
              setInfo({...info, jobDescription: e.target.value});
              if (formErrors.jobDescription) setFormErrors({...formErrors, jobDescription: ''});
            }}
          />
          {formErrors.jobDescription && <p className="text-xs text-red-500 mt-1">{formErrors.jobDescription}</p>}
        </div>
      </div>

      <button 
        onClick={handleStartAnalysis}
        disabled={loading}
        className="w-full py-4 bg-indigo-600 text-white rounded-xl font-semibold text-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>{loadingMessage}</span>
          </>
        ) : 'Analyze Role Fit'}
      </button>
    </div>
  );

  const renderAnalysis = () => (
    <div className="max-w-5xl mx-auto p-6 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-zinc-900">Role Fit Analysis</h2>
        <button 
          onClick={handleStartInterview}
          className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all flex items-center gap-2"
        >
          Start Mock Interview <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm space-y-4">
            <h3 className="text-xl font-semibold flex items-center gap-2 text-indigo-600">
              <Award className="w-5 h-5" /> Key Competencies Required
            </h3>
            <div className="flex flex-wrap gap-2">
              {analysis.keyCompetencies.map((comp: string, i: number) => (
                <span key={i} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium border border-indigo-100">
                  {comp}
                </span>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100 space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="w-5 h-5" /> Candidate Strengths
              </h3>
              <ul className="space-y-2">
                {analysis.strengths.map((s: string, i: number) => (
                  <li key={i} className="text-zinc-700 flex gap-2">
                    <span className="text-emerald-500 mt-1">•</span> {s}
                  </li>
                ))}
              </ul>
            </section>
            <section className="bg-amber-50/50 p-6 rounded-2xl border border-amber-100 space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2 text-amber-700">
                <AlertCircle className="w-5 h-5" /> Potential Gaps
              </h3>
              <ul className="space-y-2">
                {analysis.potentialGaps.map((g: string, i: number) => (
                  <li key={i} className="text-zinc-700 flex gap-2">
                    <span className="text-amber-500 mt-1">•</span> {g}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="bg-zinc-50 p-6 rounded-2xl border border-zinc-200 space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-zinc-800">
              <Target className="w-5 h-5" /> Interview Focus Areas
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analysis.focusAreas.map((area: string, i: number) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-zinc-200">
                  <div className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span className="text-zinc-700 text-sm font-medium">{area}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
            <h3 className="text-xl font-semibold text-zinc-900 border-b pb-4">Predicted Questions</h3>
            
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-3">Behavioral</h4>
                <div className="space-y-3">
                  {analysis.predictedQuestions.behavioral.map((q: string, i: number) => (
                    <p key={i} className="text-sm text-zinc-600 italic border-l-2 border-zinc-200 pl-3">"{q}"</p>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-3">Role-Specific</h4>
                <div className="space-y-3">
                  {analysis.predictedQuestions.roleSpecific.map((q: string, i: number) => (
                    <p key={i} className="text-sm text-zinc-600 italic border-l-2 border-zinc-200 pl-3">"{q}"</p>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-3">Company-Specific</h4>
                <div className="space-y-3">
                  {analysis.predictedQuestions.companySpecific.map((q: string, i: number) => (
                    <p key={i} className="text-sm text-zinc-600 italic border-l-2 border-zinc-200 pl-3">"{q}"</p>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  const renderInterview = () => (
    <div className="h-screen flex flex-col bg-zinc-50">
      <header className="bg-white border-b border-zinc-200 p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold">M</div>
          <div>
            <h2 className="font-bold text-zinc-900">Senior Interview Mentor</h2>
            <p className="text-xs text-zinc-500">Mock Interview Session • {info.companyName}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {interviewHistory.filter(h => h.role === 'user').length >= 5 && (
            <button
              onClick={handleEndInterviewEarly}
              disabled={loading}
              className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              End Session
            </button>
          )}
          <div className="text-sm font-medium text-zinc-500">
            Question {interviewHistory.filter(h => h.role === 'user').length + 1} of 15
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {interviewHistory.map((msg, i) => (
          <div key={i} className={cn(
            "flex w-full",
            msg.role === 'user' ? "justify-end" : "justify-start"
          )}>
            <div className={cn(
              "max-w-[80%] p-4 rounded-2xl shadow-sm",
              msg.role === 'user' 
                ? "bg-indigo-600 text-white rounded-tr-none" 
                : "bg-white text-zinc-800 border border-zinc-200 rounded-tl-none"
            )}>
              <div className="prose prose-sm max-w-none prose-p:leading-relaxed">
                <Markdown>{msg.content}</Markdown>
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-zinc-200 p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span className="text-sm text-zinc-500 font-medium">{loadingMessage}</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-zinc-200 shrink-0">
        <div className="max-w-4xl mx-auto flex gap-3">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={loading}
            className={cn(
              "p-3 rounded-xl transition-all flex items-center justify-center",
              isRecording 
                ? "bg-red-100 text-red-600 animate-pulse" 
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            )}
            title={isRecording ? "Stop Recording" : "Voice Response"}
          >
            {isRecording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
          <textarea 
            rows={1}
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={isRecording ? "Recording..." : "Type your response here..."}
            className="flex-1 p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
            disabled={isRecording}
          />
          <button 
            onClick={() => handleSendMessage()}
            disabled={loading || !userInput.trim() || isRecording}
            className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            <Send className="w-6 h-6" />
          </button>
        </div>
        <p className="text-center text-[10px] text-zinc-400 mt-2 uppercase tracking-widest font-bold">
          {isRecording ? "Recording in progress..." : "Press Enter to send • Shift + Enter for new line"}
        </p>
      </div>
    </div>
  );

  const renderEvaluation = () => (
    <div className="max-w-5xl mx-auto p-6 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full mb-4">
          <BarChart3 className="w-10 h-10" />
        </div>
        <h2 className="text-4xl font-bold text-zinc-900">Interview Performance Report</h2>
        <p className="text-zinc-600 max-w-2xl mx-auto">
          Comprehensive feedback from your senior mentor session for the {info.roleTitle} role at {info.companyName}.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <section className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
            <h3 className="text-xl font-semibold text-zinc-900 border-b pb-4">Scorecard</h3>
            <div className="space-y-4">
              {Object.entries(evaluation.scorecard).map(([key, value]: [string, any]) => (
                <div key={key} className="space-y-2">
                  <div className="flex justify-between text-sm font-medium">
                    <span className="capitalize text-zinc-600">{key.replace(/([A-Z])/g, ' $1')}</span>
                    <span className="text-indigo-600">{value}/5</span>
                  </div>
                  <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-600 transition-all duration-1000" 
                      style={{ width: `${(value / 5) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-indigo-600 text-white p-6 rounded-2xl shadow-lg space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <User className="w-5 h-5" /> Hiring Manager Impression
            </h3>
            <p className="text-indigo-50 leading-relaxed italic">
              "{evaluation.hiringManagerImpression}"
            </p>
          </section>
        </div>

        <div className="lg:col-span-2 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 space-y-4">
              <h3 className="text-lg font-semibold text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> What Went Well
              </h3>
              <ul className="space-y-2">
                {evaluation.whatWentWell.map((item: string, i: number) => (
                  <li key={i} className="text-emerald-900/80 text-sm flex gap-2">
                    <span className="text-emerald-500">•</span> {item}
                  </li>
                ))}
              </ul>
            </section>
            <section className="bg-amber-50 p-6 rounded-2xl border border-amber-100 space-y-4">
              <h3 className="text-lg font-semibold text-amber-800 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" /> Areas for Improvement
              </h3>
              <ul className="space-y-2">
                {evaluation.whatCouldBeImproved.map((item: string, i: number) => (
                  <li key={i} className="text-amber-900/80 text-sm flex gap-2">
                    <span className="text-amber-500">•</span> {item}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
            <h3 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
              <RefreshCw className="w-6 h-6 text-indigo-600" /> Personalized Improvement Plan
            </h3>
            <div className="space-y-8">
              {evaluation.improvementPlan.map((plan: any, i: number) => (
                <div key={i} className="space-y-4 border-l-4 border-indigo-100 pl-6">
                  <h4 className="text-xl font-semibold text-zinc-800">{plan.area}</h4>
                  <p className="text-zinc-600 text-sm">{plan.weakness}</p>
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Recommended Actions</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {plan.actions.map((action: string, j: number) => (
                        <div key={j} className="flex items-center gap-2 p-3 bg-zinc-50 rounded-xl text-sm text-zinc-700">
                          <ArrowRight className="w-3 h-3 text-indigo-500" />
                          {action}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-zinc-900 text-white p-8 rounded-2xl space-y-6">
            <h3 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-indigo-400" /> 3-Day Action Plan
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {evaluation.actionPlan3Day.map((day: string, i: number) => (
                <div key={i} className="space-y-2">
                  <span className="text-indigo-400 font-bold text-sm uppercase tracking-tighter">Day {i + 1}</span>
                  <p className="text-zinc-300 text-sm leading-relaxed">{day}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
            <h3 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-indigo-600" /> Recommended Learning Resources
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {evaluation.learningResources.map((res: { title: string, url: string, type: string }, i: number) => (
                <a 
                  key={i} 
                  href={res.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 text-sm text-zinc-700 flex gap-3 hover:bg-zinc-100 transition-colors group"
                >
                  <div className="shrink-0 w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-zinc-200 shadow-sm group-hover:border-indigo-200 transition-colors">
                    <BookOpen className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-900">{res.title}</span>
                      <ExternalLink className="w-3 h-3 text-zinc-400 group-hover:text-indigo-500 transition-colors" />
                    </div>
                    <span className={cn(
                      "text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded mt-1 inline-block",
                      res.type === 'free' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {res.type}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </section>

          <div className="flex justify-center pt-8">
            <button 
              onClick={() => window.location.reload()}
              className="px-8 py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2"
            >
              Practice Another Session <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white font-sans text-zinc-900">
      {step === 'collect' && renderCollect()}
      {step === 'analysis' && renderAnalysis()}
      {step === 'interview' && renderInterview()}
      {step === 'evaluation' && renderEvaluation()}
    </div>
  );
}

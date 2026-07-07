import React from 'react';
import { X, Play, Shield, Eye, Terminal, Sparkles } from 'lucide-react';

interface DemoVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DemoVideoModal({ isOpen, onClose }: DemoVideoModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md">
      <div className="bg-white border border-slate-250 shadow-2xl rounded-2xl max-w-3xl w-full p-6 relative flex flex-col max-h-[90vh] animate-fade-in text-slate-800">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-4 mb-4 border-slate-200">
          <div className="flex items-center gap-2.5 text-slate-850">
            <div className="p-2 bg-indigo-500/10 text-indigo-600 rounded-lg">
              <Play className="w-5 h-5 fill-indigo-600 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-800">CareerPilot 交互式演示中心</h3>
              <p className="text-xs text-slate-500">一分钟了解求职 Agent 如何保障“证据锁定”与“人在回路”</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content - Interactive Sandbox Guide representing CareerPilot Agent's workflow */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
          {/* Simulated Video Canvas / Interactive Tour */}
          <div className="aspect-video bg-gradient-to-tr from-slate-100 via-indigo-50/50 to-slate-100 rounded-xl relative overflow-hidden flex flex-col items-center justify-center p-6 text-center shadow-inner border border-slate-200">
            <div className="absolute inset-0 bg-grid-black/[0.01] bg-[size:20px_20px]" />
            <div className="absolute inset-0 bg-gradient-to-t from-white/60 to-transparent" />
            
            <div className="relative z-10 space-y-4 max-w-lg">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 text-indigo-700 rounded-full text-xs font-semibold tracking-wider uppercase border border-indigo-500/20">
                <Sparkles className="w-3.5 h-3.5 animate-pulse text-indigo-600" /> Agent 交互式技术沙盒
              </div>
              
              <h4 className="text-xl md:text-2xl font-extrabold text-slate-800 tracking-tight leading-snug">
                真实求职场景下的“多智能体合规引擎”演示
              </h4>
              
              <p className="text-xs md:text-sm text-slate-600 leading-relaxed">
                本平台解决的核心痛点：大模型编造经历（幻觉）导致简历欺诈与面试露馅。CareerPilot 通过建立严密的可回溯证据审计链，将修改动作全部限制在真实经历上下文内。
              </p>

              <div className="grid grid-cols-3 gap-3 pt-4">
                <div className="bg-white/70 backdrop-blur-sm border border-slate-200 p-2.5 rounded-lg text-left">
                  <div className="text-indigo-600 font-bold font-mono text-xs mb-1">01 证据锁定</div>
                  <div className="text-[10px] text-slate-500">每一条改写推荐均有简历与 JD 原文双向溯源。</div>
                </div>
                <div className="bg-white/70 backdrop-blur-sm border border-slate-200 p-2.5 rounded-lg text-left">
                  <div className="text-indigo-600 font-bold font-mono text-xs mb-1">02 人在回路</div>
                  <div className="text-[10px] text-slate-500">大模型改写完后强制切入等待审批，杜绝盲盒。</div>
                </div>
                <div className="bg-white/70 backdrop-blur-sm border border-slate-200 p-2.5 rounded-lg text-left">
                  <div className="text-indigo-600 font-bold font-mono text-xs mb-1">03 QualityGate</div>
                  <div className="text-[10px] text-slate-500">最终简历投递前自动过多级规则与大模型评测。</div>
                </div>
              </div>
            </div>
          </div>

          {/* Workflow Explanation section */}
          <div className="space-y-4">
            <h4 className="font-bold text-sm text-slate-700 uppercase tracking-wider">核心技术内幕</h4>
            
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-white/45 border border-slate-200 rounded-xl">
                <Terminal className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h5 className="font-bold text-xs text-slate-800">1. LLM 结构化解析 (Structured Outputs)</h5>
                  <p className="text-xs text-slate-500 mt-1">
                    系统后端底层使用 Gemini 3.5-flash 的 JSON Schema 控制，确保简历和 JD 在解析时绝对遵循特定的 TypeScript 类型，规避了大模型产生残缺 Markdown 带来的不可维护性。
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-white/45 border border-slate-200 rounded-xl">
                <Shield className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h5 className="font-bold text-xs text-slate-800">2. 双向证据映射算法</h5>
                  <p className="text-xs text-slate-500 mt-1">
                    在匹配阶段，系统会对岗位要求的每一个硬技术指标或加分项，从用户上传的简历材料中锁定相对应的“真实证据链”。如果无任何证据支撑，将被标记为“真实缺失”或“证据不足”，禁止机器替用户编造故事。
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-white/45 border border-slate-200 rounded-xl">
                <Eye className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h5 className="font-bold text-xs text-slate-800">3. 自动化质量关卡 (QualityGate)</h5>
                  <p className="text-xs text-slate-500 mt-1">
                    投递前的最后一关会执行多路评测，生成符合安全审查标准的 HTML 报告，对所有修饰改写点的虚构风险划分类别（高风险/中风险/低风险），提醒用户面试前务必核查。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 pt-4 mt-6 flex justify-between items-center text-[10px] text-slate-500">
          <span>💡 建议：配合 Music 伴奏，能在该工作台上体验更沉浸式的修改过程。</span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-lg text-xs transition-colors"
          >
            开启体验
          </button>
        </div>
      </div>
    </div>
  );
}

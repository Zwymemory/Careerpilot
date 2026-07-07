import React, { useState } from 'react';
import { Application } from '../types';
import { Briefcase, Plus, Edit2 } from 'lucide-react';

interface CrmTrackerProps {
  applications: Application[];
  onUpdateStatus: (id: string, status: string, notes?: string, memory?: string) => Promise<void>;
  onAddApplication: (company: string, title: string, notes?: string) => Promise<void>;
}

export default function CrmTracker({
  applications,
  onUpdateStatus,
  onAddApplication
}: CrmTrackerProps) {
  const [newCompany, setNewCompany] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Application | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editMemory, setEditMemory] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompany || !newTitle) return;
    await onAddApplication(newCompany, newTitle, newNotes);
    setNewCompany('');
    setNewTitle('');
    setNewNotes('');
    setShowAddForm(false);
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    await onUpdateStatus(editingItem.id, editingItem.status, editNotes, editMemory);
    setEditingItem(null);
  };

  const statusMap = {
    ready_to_apply: { label: '准备投递', color: 'bg-slate-100 text-slate-600 border-slate-200' },
    applied: { label: '已投递', color: 'bg-blue-50 text-blue-600 border-blue-200 animate-pulse' },
    interviewing: { label: '面试中', color: 'bg-amber-50 text-amber-600 border-amber-200' },
    offer: { label: '斩获 Offer', color: 'bg-emerald-50 text-emerald-600 border-emerald-200 font-bold' },
    rejected: { label: '已谢绝', color: 'bg-rose-50 text-rose-500 border-rose-200' }
  };

  return (
    <div className="bg-white/45 backdrop-blur-xl border border-white/70 shadow-xl rounded-2xl p-6 space-y-6 text-slate-850">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-500/10 text-indigo-600 rounded-lg">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-sm md:text-base">ApplicationCRM 投递管理与长期记忆</h4>
            <p className="text-xs text-slate-500">保留每一次交互、缺口反思、面试教训与投递档案</p>
          </div>
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1 transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" /> 新增记录
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <form onSubmit={handleCreate} className="p-4 bg-white/60 backdrop-blur-md border border-slate-200 rounded-xl space-y-3 animate-fade-in shadow-inner">
          <h5 className="text-xs font-bold text-slate-600 uppercase">登记求职投递意向</h5>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="公司名称 (如：阿里)"
              value={newCompany}
              onChange={(e) => setNewCompany(e.target.value)}
              className="p-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/10 focus:outline-none"
              required
            />
            <input
              type="text"
              placeholder="岗位标题 (如：Python 实习生)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="p-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/10 focus:outline-none"
              required
            />
          </div>
          <textarea
            placeholder="备注、备注或求职进展说明..."
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            className="p-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/10 focus:outline-none w-full h-16"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
            >
              保存意向
            </button>
          </div>
        </form>
      )}

      {/* Grid columns or list */}
      <div className="space-y-3">
        {applications.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-xs">
            暂无投递记录。你可以添加目标投递意向，实现全链路追踪。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {applications.map((app) => (
              <div
                key={app.id}
                className="border border-slate-200 rounded-xl p-4 bg-white/30 flex flex-col justify-between hover:bg-white/60 hover:border-slate-300 transition-all shadow-sm"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-slate-850 text-sm">{app.company}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{app.title}</p>
                    </div>
                    
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${statusMap[app.status]?.color}`}>
                      {statusMap[app.status]?.label}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 bg-white/50 border border-slate-100 p-2 rounded-lg italic mt-3 leading-relaxed">
                    <strong>备注：</strong>{app.notes || '暂无详细备注说明。'}
                  </p>

                  {app.memory && (
                    <div className="mt-3 p-2 bg-indigo-50 border border-indigo-100 text-slate-700 rounded-lg text-[11px] leading-relaxed">
                      <strong className="text-indigo-600 text-[10px] uppercase font-bold block mb-0.5 font-sans">🧠 长期记忆反馈 (Memory)</strong>
                      {app.memory}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex gap-1.5 flex-wrap">
                    {Object.keys(statusMap).map((st) => (
                      <button
                        key={st}
                        onClick={() => onUpdateStatus(app.id, st)}
                        className={`text-[9px] px-1.5 py-0.5 rounded font-medium border transition-all ${
                          app.status === st
                            ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-700'
                        }`}
                      >
                        {statusMap[st as keyof typeof statusMap]?.label.split(' ')[0]}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      setEditingItem(app);
                      setEditNotes(app.notes);
                      setEditMemory(app.memory || '');
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-black/5 transition-colors"
                    title="编辑记忆与备注"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editing Dialog */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl max-w-md w-full p-5 relative text-slate-800">
            <h4 className="font-bold text-sm text-slate-800 mb-4">编辑求职进展与长期记忆</h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-500 mb-1">日常随笔备注</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full h-20 p-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/10"
                  placeholder="例如：今天已完成内推，简历已投递..."
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-500 mb-1">大脑长期记忆反思</label>
                <textarea
                  value={editMemory}
                  onChange={(e) => setEditMemory(e.target.value)}
                  className="w-full h-20 p-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/10"
                  placeholder="例如：大模型对并发性能优化的回答，面试官反馈很好..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setEditingItem(null)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-lg text-xs"
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs"
              >
                提交更新
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

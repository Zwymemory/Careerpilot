import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Music, Volume2, SkipForward } from 'lucide-react';

interface Track {
  title: string;
  url: string;
  desc: string;
}

const PLAYLIST: Track[] = [
  {
    title: '求职专注 Lofi 伴奏',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    desc: '舒适的低频节奏，陪伴你锁定每一条简历证据'
  },
  {
    title: '深夜咖啡馆氛围音',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    desc: '温暖的白噪音，提高改写专注度'
  },
  {
    title: '太空科幻沉浸式 Ambient',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    desc: '流动的高维电子垫音，理清面试通关脑图'
  }
];

export default function MusicPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentTrack = PLAYLIST[currentTrackIndex];

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = currentTrack.url;
      audioRef.current.load();
      if (isPlaying) {
        audioRef.current.play().catch(() => setIsPlaying(false));
      }
    }
  }, [currentTrackIndex]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => {
        console.error('Playback failed', e);
      });
    }
  };

  const nextTrack = () => {
    setCurrentTrackIndex((prev) => (prev + 1) % PLAYLIST.length);
  };

  return (
    <div className="bg-white/45 backdrop-blur-xl border border-white/75 shadow-xl rounded-full px-6 py-3 flex items-center justify-between gap-6 max-w-lg w-full transition-all duration-300 hover:shadow-2xl hover:border-white/90 text-slate-800">
      <audio
        ref={audioRef}
        src={currentTrack.url}
        loop
        preload="none"
      />
      
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={`p-2 bg-indigo-500/10 text-indigo-600 rounded-full ${isPlaying ? 'animate-spin-slow' : ''}`}>
          <Music className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-indigo-600 font-semibold tracking-wider uppercase">音乐工作台</p>
          <p className="text-sm font-medium text-slate-800 truncate">{isPlaying ? currentTrack.title : '未选择/已暂停音乐'}</p>
          {isPlaying && (
            <p className="text-[10px] text-slate-500 truncate mt-0.5">{currentTrack.desc}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 active:scale-95 transition-all shadow-md"
          title={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-white text-white" /> : <Play className="w-4 h-4 fill-white text-white translate-x-0.5" />}
        </button>

        {/* Skip track */}
        <button
          onClick={nextTrack}
          className="p-2 text-slate-500 hover:text-slate-700 active:scale-90 transition-all rounded-full hover:bg-black/5"
          title="下一首"
        >
          <SkipForward className="w-4 h-4" />
        </button>

        {/* Volume */}
        <div className="flex items-center gap-2 max-sm:hidden">
          <Volume2 className="w-4 h-4 text-slate-500" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-16 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
        </div>
      </div>
    </div>
  );
}

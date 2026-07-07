import React, { useState, useEffect, useRef } from 'react';
import { Coins, Play } from 'lucide-react';

interface PhysicsFloatingRailsProps {
  onOpenBalance: () => void;
  onOpenDemo: () => void;
}

interface PhysicsItem {
  id: 'api' | 'demo';
  x: number;
  y: number;
  vx: number;
  vy: number;
  isDragging: boolean;
}

export default function PhysicsFloatingRails({ onOpenBalance, onOpenDemo }: PhysicsFloatingRailsProps) {
  const [physicsEnabled, setPhysicsEnabled] = useState(false);
  
  // Track viewport dimensions
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  // Refs for independent speed control (ranging from 1.5 to 2.5)
  const apiCurrentSpeedRef = useRef(1.5 + Math.random() * 1.0);
  const apiTargetSpeedRef = useRef(1.5 + Math.random() * 1.0);
  const demoCurrentSpeedRef = useRef(1.5 + Math.random() * 1.0);
  const demoTargetSpeedRef = useRef(1.5 + Math.random() * 1.0);
  const lastSpeedUpdateTimeRef = useRef(Date.now());

  // Timers for auto-float triggers (2 minutes idle, 1 minute blur)
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const blurTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Update window size on resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Set up auto-drift timer triggers based on idle time (2m) and lost focus time (1m)
  useEffect(() => {
    const handleActivity = () => {
      // Return to fixed/resting positions immediately on user activity
      setPhysicsEnabled(false);
      resetIdleTimer();
    };

    const resetIdleTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        setPhysicsEnabled(true);
      }, 120000); // 2 minutes
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden, start the 1-minute timer to auto-float
        if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
        blurTimerRef.current = setTimeout(() => {
          setPhysicsEnabled(true);
        }, 60000); // 1 minute
      } else {
        // Tab is visible again, check/reset activity
        if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
        handleActivity();
      }
    };

    const handleWindowBlur = () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
      blurTimerRef.current = setTimeout(() => {
        setPhysicsEnabled(true);
      }, 60000); // 1 minute
    };

    const handleWindowFocus = () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
      handleActivity();
    };

    // User interaction event listeners
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }));
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    // Initial countdown
    resetIdleTimer();

    return () => {
      activityEvents.forEach(evt => window.removeEventListener(evt, handleActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const radius = 24; // 48px diameter buttons = 24px radius

  // Physics items state stored in a ref to bypass React state latency in high-speed requestAnimationFrame loop
  const itemsRef = useRef<PhysicsItem[]>([
    { id: 'api', x: 0, y: 0, vx: 0, vy: 0, isDragging: false },
    { id: 'demo', x: 0, y: 0, vx: 0, vy: 0, isDragging: false }
  ]);

  // Forces React re-renders when positions change during animation
  const [, setRenderTrigger] = useState(0);

  // Mouse/Touch tracking refs
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeDragIdRef = useRef<'api' | 'demo' | null>(null);
  const pointerHistoryRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const clickStartRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });

  // Initialize coordinates based on current layout when physics starts
  const initializePhysicsPositions = () => {
    const W = window.innerWidth;
    const H = window.innerHeight;

    // Distribute them evenly and assign a starting random drifting angle
    const angle1 = Math.random() * Math.PI * 2;
    const angle2 = Math.random() * Math.PI * 2;
    
    // Assign starting speeds independently (1.5 to 2.5)
    const speed1 = 1.5 + Math.random() * 1.0;
    const speed2 = 1.5 + Math.random() * 1.0;

    apiCurrentSpeedRef.current = speed1;
    apiTargetSpeedRef.current = speed1;
    demoCurrentSpeedRef.current = speed2;
    demoTargetSpeedRef.current = speed2;
    lastSpeedUpdateTimeRef.current = Date.now();

    // API starts higher, DEMO starts lower
    const apiX = 120;
    const apiY = H - 200;
    const demoX = 180;
    const demoY = H - 120;

    itemsRef.current = [
      {
        id: 'api',
        x: apiX,
        y: apiY,
        vx: Math.cos(angle1) * speed1,
        vy: Math.sin(angle1) * speed1,
        isDragging: false
      },
      {
        id: 'demo',
        x: demoX,
        y: demoY,
        vx: Math.cos(angle2) * speed2,
        vy: Math.sin(angle2) * speed2,
        isDragging: false
      }
    ];
  };

  // Run the physics engine loop when enabled
  useEffect(() => {
    if (!physicsEnabled) return;

    // Reset positions and apply starting drift when enabling
    initializePhysicsPositions();

    let animId: number;
    const restitution = 1.0;   // Perfect elastic collisions off boundary surfaces in space
    const decelerateFriction = 0.975; // Slow drag to settle tossed/flicked speeds back to target speed

    const tick = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const items = itemsRef.current;

      // Dynamically fluctuate target speeds for the two balls independently every 3 seconds (between 1.5 and 2.5)
      const now = Date.now();
      if (now - lastSpeedUpdateTimeRef.current > 3000) {
        apiTargetSpeedRef.current = 1.5 + Math.random() * 1.0;
        demoTargetSpeedRef.current = 1.5 + Math.random() * 1.0;
        lastSpeedUpdateTimeRef.current = now;
      }

      // Smoothly interpolate current speeds toward target speeds
      apiCurrentSpeedRef.current += (apiTargetSpeedRef.current - apiCurrentSpeedRef.current) * 0.02;
      demoCurrentSpeedRef.current += (demoTargetSpeedRef.current - demoCurrentSpeedRef.current) * 0.02;

      // Update positions & velocities
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.isDragging) continue;

        // Apply velocities
        item.x += item.vx;
        item.y += item.vy;

        // Space Drift Speed Management:
        // Adjust and stabilize velocity based on each item's independent random speed profile
        const targetSpeed = item.id === 'api' ? apiCurrentSpeedRef.current : demoCurrentSpeedRef.current;
        const currentSpeed = Math.sqrt(item.vx * item.vx + item.vy * item.vy);
        
        if (currentSpeed > targetSpeed) {
          item.vx *= decelerateFriction;
          item.vy *= decelerateFriction;
        } else if (currentSpeed < targetSpeed) {
          if (currentSpeed > 0.01) {
            const boost = targetSpeed / currentSpeed;
            // Smoothly interpolate to avoid velocity discontinuities
            item.vx = item.vx * 0.96 + item.vx * boost * 0.04;
            item.vy = item.vy * 0.96 + item.vy * boost * 0.04;
          } else {
            // If stationary, push in random space direction
            const angle = Math.random() * Math.PI * 2;
            item.vx = Math.cos(angle) * targetSpeed;
            item.vy = Math.sin(angle) * targetSpeed;
          }
        }

        // Bounce Right
        if (item.x > W - radius) {
          item.x = W - radius;
          item.vx = -Math.abs(item.vx) * restitution;
        }
        // Bounce Left
        else if (item.x < radius) {
          item.x = radius;
          item.vx = Math.abs(item.vx) * restitution;
        }

        // Bounce Bottom
        if (item.y > H - radius) {
          item.y = H - radius;
          item.vy = -Math.abs(item.vy) * restitution;
        }
        // Bounce Top
        else if (item.y < radius) {
          item.y = radius;
          item.vy = Math.abs(item.vy) * restitution;
        }

        // Viewport boundaries backup check
        item.x = Math.max(radius, Math.min(W - radius, item.x));
        item.y = Math.max(radius, Math.min(H - radius, item.y));
      }

      // Elastic circle-to-circle collision between API and DEMO
      const item1 = items[0];
      const item2 = items[1];
      if (!item1.isDragging && !item2.isDragging) {
        const dx = item2.x - item1.x;
        const dy = item2.y - item1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = radius * 2;

        if (dist < minDist) {
          // Normal direction
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);

          // Relative velocity
          const rvx = item2.vx - item1.vx;
          const rvy = item2.vy - item1.vy;

          // Relative velocity along normal
          const velAlongNormal = rvx * nx + rvy * ny;

          // Only resolve if moving towards each other
          if (velAlongNormal < 0) {
            const impulse = -(1 + restitution) * velAlongNormal / 2;
            item1.vx -= impulse * nx;
            item1.vy -= impulse * ny;
            item2.vx += impulse * nx;
            item2.vy += impulse * ny;

            // Simple positional correction to prevent overlap sticking
            const overlap = minDist - dist;
            item1.x -= nx * overlap * 0.51;
            item1.y -= ny * overlap * 0.51;
            item2.x += nx * overlap * 0.51;
            item2.y += ny * overlap * 0.51;
          }
        }
      }

      setRenderTrigger(prev => prev + 1);
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [physicsEnabled]);

  // Pointer movement triggers dragging
  const handlePointerDown = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
    itemId: 'api' | 'demo'
  ) => {
    e.stopPropagation();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const items = itemsRef.current;
    const itemIndex = items.findIndex(item => item.id === itemId);
    if (itemIndex === -1) return;

    const item = items[itemIndex];
    item.isDragging = true;
    activeDragIdRef.current = itemId;

    dragOffsetRef.current = {
      x: clientX - item.x,
      y: clientY - item.y
    };

    pointerHistoryRef.current = [{ x: clientX, y: clientY, t: Date.now() }];
    clickStartRef.current = { x: clientX, y: clientY, time: Date.now() };

    setRenderTrigger(prev => prev + 1);

    // Attach global mouse and touch events
    const onPointerMove = (moveEvent: MouseEvent | TouchEvent) => {
      const moveX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const moveY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const currentItems = itemsRef.current;
      const currentIdx = currentItems.findIndex(x => x.id === itemId);
      if (currentIdx === -1) return;

      const currentItem = currentItems[currentIdx];
      const nextX = moveX - dragOffsetRef.current.x;
      const nextY = moveY - dragOffsetRef.current.y;

      currentItems[currentIdx] = {
        ...currentItem,
        x: Math.max(radius, Math.min(window.innerWidth - radius, nextX)),
        y: Math.max(radius, Math.min(window.innerHeight - radius, nextY)),
        vx: 0,
        vy: 0
      };

      // Keep historical coordinates for flick speed calculation
      const history = pointerHistoryRef.current;
      history.push({ x: moveX, y: moveY, t: Date.now() });
      if (history.length > 5) {
        history.shift();
      }

      setRenderTrigger(prev => prev + 1);
    };

    const onPointerUp = (upEvent: MouseEvent | TouchEvent) => {
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);

      activeDragIdRef.current = null;

      const currentItems = itemsRef.current;
      const currentIdx = currentItems.findIndex(x => x.id === itemId);
      if (currentIdx === -1) return;

      const currentItem = currentItems[currentIdx];
      
      const upX = 'touches' in upEvent ? (upEvent.touches[0]?.clientX || clientX) : upEvent.clientX;
      const upY = 'touches' in upEvent ? (upEvent.touches[0]?.clientY || clientY) : upEvent.clientY;

      // Handle simple click triggers vs physics throw
      const clickDist = Math.sqrt(Math.pow(upX - clickStartRef.current.x, 2) + Math.pow(upY - clickStartRef.current.y, 2));
      const clickDuration = Date.now() - clickStartRef.current.time;

      if (clickDist < 5 && clickDuration < 300) {
        // Trigger default button actions on quick clean clicks
        if (itemId === 'api') {
          onOpenBalance();
        } else {
          onOpenDemo();
        }
        
        currentItems[currentIdx] = {
          ...currentItem,
          isDragging: false,
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5
        };
      } else {
        // Flick/Throw velocity calculation based on last pointer positions
        const history = pointerHistoryRef.current;
        let calculatedVx = 0;
        let calculatedVy = 0;

        if (history.length >= 2) {
          const first = history[0];
          const last = history[history.length - 1];
          const dT = (last.t - first.t) / 1000; // in seconds

          if (dT > 0.02) {
            calculatedVx = (last.x - first.x) / dT * 0.015;
            calculatedVy = (last.y - first.y) / dT * 0.015;
          }
        }

        // Apply a reasonable throwing cap (Max speed limits)
        const maxSpeed = 10;
        const speed = Math.sqrt(calculatedVx * calculatedVx + calculatedVy * calculatedVy);
        if (speed > maxSpeed) {
          calculatedVx = (calculatedVx / speed) * maxSpeed;
          calculatedVy = (calculatedVy / speed) * maxSpeed;
        }

        // Launch item back into space drift loop
        currentItems[currentIdx] = {
          ...currentItem,
          isDragging: false,
          vx: calculatedVx || (Math.random() - 0.5) * 2,
          vy: calculatedVy || (Math.random() - 0.5) * 2
        };
      }

      setRenderTrigger(prev => prev + 1);
    };

    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);
  };

  const apiItem = itemsRef.current[0];
  const demoItem = itemsRef.current[1];

  return (
    <>
      {/* 1. Fixed Layout (Default Mode) with clean glassmorphic themes */}
      {!physicsEnabled && (
        <div className="fixed left-6 bottom-20 z-40 flex flex-col gap-6">
          {/* API credit tracker (Warm Gold) */}
          <button
            onClick={onOpenBalance}
            className="w-12 h-12 rounded-full bg-slate-950/95 border border-amber-500/30 hover:border-amber-500/80 shadow-[0_4px_12px_rgba(245,158,11,0.15)] hover:shadow-[0_4px_20px_rgba(245,158,11,0.3)] flex flex-col items-center justify-center text-slate-200 hover:text-white hover:scale-110 active:scale-95 transition-all duration-300 z-10"
            title="供应商算力余额"
          >
            <Coins className="w-5 h-5 text-amber-500 transition-transform" />
            <span className="text-[8px] font-black tracking-widest mt-0.5 text-amber-400/90 font-mono">API</span>
          </button>

          {/* Demo Video interactive (Cool Indigo) */}
          <button
            onClick={onOpenDemo}
            className="w-12 h-12 rounded-full bg-slate-950/95 border border-indigo-500/30 hover:border-indigo-500/80 shadow-[0_4px_12px_rgba(99,102,241,0.15)] hover:shadow-[0_4px_20px_rgba(99,102,241,0.3)] flex flex-col items-center justify-center text-slate-200 hover:text-white hover:scale-110 active:scale-95 transition-all duration-300 z-10"
            title="系统演示教程"
          >
            <Play className="w-4 h-4 fill-indigo-400 text-indigo-400 transition-transform" />
            <span className="text-[8px] font-black tracking-widest mt-0.5 text-indigo-400/90 font-mono">DEMO</span>
          </button>
        </div>
      )}

      {/* 2. Physics Interactive Space Drift Mode with clean themes */}
      {physicsEnabled && (
        <>
          {/* Simulated API button */}
          <div
            onMouseDown={(e) => handlePointerDown(e, 'api')}
            onTouchStart={(e) => handlePointerDown(e, 'api')}
            style={{
              position: 'fixed',
              left: `${apiItem.x}px`,
              top: `${apiItem.y}px`,
              transform: 'translate(-50%, -50%)',
              cursor: apiItem.isDragging ? 'grabbing' : 'grab',
              touchAction: 'none'
            }}
            className="w-12 h-12 rounded-full bg-slate-950/95 border border-amber-500/40 hover:border-amber-500/80 shadow-[0_4px_12px_rgba(245,158,11,0.2)] flex flex-col items-center justify-center text-slate-200 select-none z-40 transition-shadow"
            title="供应商算力余额 (空间随机飘流，拖动抛出)"
          >
            <Coins className="w-5 h-5 text-amber-500" />
            <span className="text-[8px] font-black tracking-widest mt-0.5 text-amber-400/90 font-mono">API</span>
          </div>

          {/* Simulated DEMO button */}
          <div
            onMouseDown={(e) => handlePointerDown(e, 'demo')}
            onTouchStart={(e) => handlePointerDown(e, 'demo')}
            style={{
              position: 'fixed',
              left: `${demoItem.x}px`,
              top: `${demoItem.y}px`,
              transform: 'translate(-50%, -50%)',
              cursor: demoItem.isDragging ? 'grabbing' : 'grab',
              touchAction: 'none'
            }}
            className="w-12 h-12 rounded-full bg-slate-950/95 border border-indigo-500/40 hover:border-indigo-500/80 shadow-[0_4px_12px_rgba(99,102,241,0.2)] flex flex-col items-center justify-center text-slate-200 select-none z-40 transition-shadow"
            title="系统演示教程 (空间随机飘流，拖动抛出)"
          >
            <Play className="w-4 h-4 fill-indigo-400 text-indigo-400" />
            <span className="text-[8px] font-black tracking-widest mt-0.5 text-indigo-400/90 font-mono">DEMO</span>
          </div>
        </>
      )}
    </>
  );
}

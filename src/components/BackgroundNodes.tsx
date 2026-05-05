import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

export function BackgroundNodes() {
  const [nodes, setNodes] = useState<{ x: number; y: number; delay: number }[]>([]);

  useEffect(() => {
    // Generate random nodes across screen
    const newNodes = Array.from({ length: 20 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 5,
    }));
    setNodes(newNodes);
  }, []);

  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-[#0a0a0a]">
      {/* Subtle grid gradient overlaid on dark background */}
      <div 
        className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:36px_36px]"
        style={{ maskImage: 'radial-gradient(ellipse 60% 60% at 50% 50%, #000 70%, transparent 100%)' }}
      ></div>

      <svg className="absolute inset-0 w-full h-full opacity-20">
        <defs>
          <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366F1" stopOpacity="0" />
            <stop offset="50%" stopColor="#6366F1" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Animated paths between nodes */}
        {nodes.map((node, i) => {
          const nextNode = nodes[(i + 1) % nodes.length];
          return (
            <motion.line
              key={`line-${i}`}
              x1={`${node.x}%`}
              y1={`${node.y}%`}
              x2={`${nextNode.x}%`}
              y2={`${nextNode.y}%`}
              stroke="url(#flowGradient)"
              strokeWidth="0.5"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ 
                pathLength: [0, 1, 1],
                opacity: [0, 0.5, 0]
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                delay: node.delay,
                ease: "easeInOut"
              }}
            />
          );
        })}
      </svg>
      
      {/* Glowing nodes */}
      {nodes.map((node, i) => (
        <motion.div
          key={`node-${i}`}
          className="absolute w-1 h-1 bg-indigo-500 rounded-full"
          style={{ left: `${node.x}%`, top: `${node.y}%` }}
          animate={{
            boxShadow: [
              "0 0 0 0 rgba(99, 102, 241, 0)",
              "0 0 10px 2px rgba(99, 102, 241, 0.4)",
              "0 0 0 0 rgba(99, 102, 241, 0)",
            ]
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            delay: node.delay,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
}

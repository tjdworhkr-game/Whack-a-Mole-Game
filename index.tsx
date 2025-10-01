/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';

const GAME_DURATION = 60; // seconds
const POP_INTERVAL = 1000; // ms
const VISIBLE_DURATION = 800; // ms
const GRID_SIZE = 9;
const BOMB_CHANCE = 0.2; // 20% chance of a bomb appearing

type HoleContent = 'empty' | 'mole' | 'bomb';

const App: React.FC = () => {
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
    const [isActive, setIsActive] = useState(false);
    const [holeContents, setHoleContents] = useState<HoleContent[]>(new Array(GRID_SIZE).fill('empty'));
    const [gameOverReason, setGameOverReason] = useState<'time' | 'bomb' | null>(null);
    const moleTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
    
    // Refs for audio
    const audioContextRef = useRef<AudioContext | null>(null);
    const musicIntervalRef = useRef<number | null>(null);
    const noteIndexRef = useRef(0);

    // --- Sound Effects Logic ---
    const playWhackSound = useCallback(() => {
        if (!audioContextRef.current || audioContextRef.current.state !== 'running') return;
        const context = audioContextRef.current;
        const now = context.currentTime;
        const duration = 0.15;

        const oscillator = context.createOscillator();
        const gainNode = context.createGain();

        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(300, now);
        oscillator.frequency.exponentialRampToValueAtTime(100, now + duration * 0.8);

        gainNode.connect(context.destination);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01);
        gainNode.gain.linearRampToValueAtTime(0, now + duration);

        oscillator.connect(gainNode);
        oscillator.start(now);
        oscillator.stop(now + duration);
    }, []);

    const playBombSound = useCallback(() => {
        if (!audioContextRef.current || audioContextRef.current.state !== 'running') return;
        const context = audioContextRef.current;
        const now = context.currentTime;
        const duration = 0.5;

        const oscillator = context.createOscillator();
        const gainNode = context.createGain();

        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(120, now);
        oscillator.frequency.exponentialRampToValueAtTime(30, now + duration);

        gainNode.connect(context.destination);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.2, now + 0.01);
        gainNode.gain.linearRampToValueAtTime(0, now + duration);

        oscillator.connect(gainNode);
        oscillator.start(now);
        oscillator.stop(now + duration);
    }, []);

    // --- Background Music Logic ---
    const playMusic = useCallback(() => {
        if (!audioContextRef.current) {
            try {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            } catch (e) {
                console.error("Web Audio API is not supported in this browser");
                return;
            }
        }
        
        const context = audioContextRef.current;
        if (context.state === 'suspended') {
            context.resume();
        }
        
        if (musicIntervalRef.current) {
            clearInterval(musicIntervalRef.current);
        }
    
        const melody = [392.00, 523.25, 659.26, 783.99, 659.26, 523.25, 392.00, null]; // G4, C5, E5, G5, E5, C5, G4, rest
        const noteDuration = 0.12; // seconds
        const noteInterval = 150; // ms
    
        musicIntervalRef.current = window.setInterval(() => {
            const freq = melody[noteIndexRef.current];
            noteIndexRef.current = (noteIndexRef.current + 1) % melody.length;
            
            if (freq && context.state === 'running') {
                const oscillator = context.createOscillator();
                const gainNode = context.createGain();
    
                oscillator.type = 'triangle'; // A softer, more "chiptune" sound
                oscillator.frequency.setValueAtTime(freq, context.currentTime);
    
                gainNode.connect(context.destination);
                gainNode.gain.setValueAtTime(0, context.currentTime);
                gainNode.gain.linearRampToValueAtTime(0.1, context.currentTime + 0.01); // Quick attack
                gainNode.gain.linearRampToValueAtTime(0, context.currentTime + noteDuration); // Decay
    
                oscillator.connect(gainNode);
                oscillator.start();
                oscillator.stop(context.currentTime + noteDuration);
            }
        }, noteInterval);
    }, []);
    
    const stopMusic = useCallback(() => {
        if (musicIntervalRef.current) {
            clearInterval(musicIntervalRef.current);
            musicIntervalRef.current = null;
        }
    }, []);

    // Effect to control music based on game state
    useEffect(() => {
        if (isActive) {
            playMusic();
        } else {
            stopMusic();
        }
        // Cleanup on unmount
        return () => {
            stopMusic();
        };
    }, [isActive, playMusic, stopMusic]);


    // Cleanup timeouts on unmount
    useEffect(() => {
        return () => {
            moleTimeouts.current.forEach(clearTimeout);
        };
    }, []);
    
    // Game timer logic
    useEffect(() => {
        if (!isActive) return;

        if (timeLeft <= 0) {
            setIsActive(false);
            moleTimeouts.current.forEach(clearTimeout);
            setHoleContents(new Array(GRID_SIZE).fill('empty'));
             if (gameOverReason === null) {
                setGameOverReason('time');
            }
            return;
        }

        const timerId = setTimeout(() => {
            setTimeLeft(prevTime => prevTime - 1);
        }, 1000);

        return () => clearTimeout(timerId);
    }, [isActive, timeLeft, gameOverReason]);

    // Mole and bomb popping logic
    useEffect(() => {
        if (!isActive) return;

        const popInterval = setInterval(() => {
            setHoleContents(currentHoles => {
                const emptyHolesIndexes = currentHoles
                    .map((content, index) => (content === 'empty' ? index : -1))
                    .filter(index => index !== -1);

                if (emptyHolesIndexes.length === 0) {
                    return currentHoles;
                }

                const randomIndex = emptyHolesIndexes[Math.floor(Math.random() * emptyHolesIndexes.length)];
                
                const isBomb = Math.random() < BOMB_CHANCE;
                const content: HoleContent = isBomb ? 'bomb' : 'mole';
                
                const newContents = [...currentHoles];
                newContents[randomIndex] = content;

                const hideTimeout = setTimeout(() => {
                    setHoleContents(prev => {
                        const updatedContents = [...prev];
                        if (updatedContents[randomIndex] === content) {
                           updatedContents[randomIndex] = 'empty';
                        }
                        return updatedContents;
                    });
                }, VISIBLE_DURATION);

                moleTimeouts.current.push(hideTimeout);
                return newContents;
            });
        }, POP_INTERVAL);

        return () => {
            clearInterval(popInterval);
            moleTimeouts.current.forEach(clearTimeout);
            moleTimeouts.current = [];
        };
    }, [isActive]);


    const startGame = () => {
        setScore(0);
        setTimeLeft(GAME_DURATION);
        setIsActive(true);
        setGameOverReason(null);
        setHoleContents(new Array(GRID_SIZE).fill('empty'));
    };

    const whackItem = useCallback((index: number) => {
        if (holeContents[index] === 'empty' || !isActive) return;
        
        const content = holeContents[index];
    
        if (content === 'mole') {
            playWhackSound();
            setScore(prevScore => prevScore + 10);
        } else if (content === 'bomb') {
            playBombSound();
            setScore(prevScore => prevScore - 10);
        }
    
        // After updating score, remove the item from the hole
        setHoleContents(prev => {
            const newContents = [...prev];
            newContents[index] = 'empty';
            return newContents;
        });
    }, [holeContents, isActive, playWhackSound, playBombSound]);
    
    const isGameEnded = gameOverReason !== null;

    const getGameOverMessage = () => {
        if (gameOverReason === 'time') {
            return `게임 종료! 최종 점수: ${score}`;
        }
        return '';
    };

    return (
        <div className={`game-container ${isActive ? 'active' : ''}`} role="main" aria-labelledby="game-title">
            <h1 id="game-title">두더지 잡기</h1>
            <div className="header">
                <span aria-label={`Score is ${score}`}>점수: {score}</span>
                <span aria-label={`Time left is ${timeLeft} seconds`}>시간: {timeLeft}</span>
            </div>
            <div className="grid">
                {holeContents.map((content, index) => {
                    const isUp = content !== 'empty';
                    const itemType = isUp ? content : 'hole';
                    return (
                        <div 
                            key={index} 
                            className={`hole ${isUp ? 'up' : ''} ${content}`}
                            onClick={() => whackItem(index)}
                            role="button"
                            aria-label={`${itemType} at position ${index + 1}`}
                            aria-pressed={isUp}
                        >
                            <div className="item" />
                        </div>
                    )
                })}
            </div>
            <button className="start-btn" onClick={startGame} disabled={isActive}>
                {isGameEnded ? '다시하기' : '시작'}
            </button>
            {isGameEnded && <h2 className="final-score">{getGameOverMessage()}</h2>}
        </div>
    );
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<React.StrictMode><App /></React.StrictMode>);
}
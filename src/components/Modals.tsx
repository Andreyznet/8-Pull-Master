import React from 'react';
import { Trophy, X, Play, RotateCcw, Award, CheckCircle2, AlertTriangle } from 'lucide-react';
import { GameMode, Player } from '../types/game';

interface VictoryModalProps {
  winner: Player | null;
  winReason: string;
  onPlayAgain: () => void;
  onSwitchMode: (mode: GameMode) => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  winner,
  winReason,
  onPlayAgain,
  onSwitchMode,
}) => {
  if (!winner) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-linear-to-b from-amber-400 to-amber-600 flex items-center justify-center shadow-lg mb-4 ring-4 ring-amber-400/20">
            <Trophy className="w-8 h-8 text-slate-950" />
          </div>

          <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">
            Victory!
          </span>
          <h2 className="text-2xl font-black text-white mt-1">
            {winner.name} Wins the Rack!
          </h2>

          <p className="text-sm text-slate-400 mt-2 max-w-xs">
            {winReason}
          </p>

          <div className="w-full my-6 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 flex justify-around">
            <div className="flex flex-col items-center">
              <span className="text-xs text-slate-500">Group</span>
              <span className="text-sm font-bold text-slate-200 capitalize">
                {winner.group || 'Open'}
              </span>
            </div>
            <div className="h-8 w-px bg-slate-800 self-center" />
            <div className="flex flex-col items-center">
              <span className="text-xs text-slate-500">Result</span>
              <span className="text-sm font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> 8-Ball Pocketed
              </span>
            </div>
          </div>

          <div className="flex flex-col w-full gap-2.5">
            <button
              type="button"
              onClick={onPlayAgain}
              className="w-full py-3 px-4 rounded-xl bg-linear-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Rack New Balls (Play Again)</span>
            </button>

            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={() => onSwitchMode('vs-bot')}
                className="py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
              >
                Vs Bot Match
              </button>
              <button
                type="button"
                onClick={() => onSwitchMode('pass-and-play')}
                className="py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
              >
                2 Player Pass & Play
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-bold text-white">8-Ball Pool Rules & Controls</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs md:text-sm text-slate-300 leading-relaxed">
          <div>
            <h4 className="font-bold text-white mb-1">Controls</h4>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li><strong className="text-slate-200">Aiming:</strong> Drag or click on the pool table to rotate the cue stick in full 360°.</li>
              <li><strong className="text-slate-200">Fine Aim:</strong> Use the &lt; and &gt; buttons to make precise micro-angle adjustments.</li>
              <li><strong className="text-slate-200">Power Meter:</strong> Pull down the vertical cue stick slider on the side and release to strike!</li>
              <li><strong className="text-slate-200">Cue Spin & English:</strong> Click "Spin" to place chalk contact point for Topspin (follow), Backspin (draw), or Left/Right English.</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white mb-1">Official 8-Ball Rules</h4>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li><strong className="text-slate-200">The Break:</strong> Racked triangle with 8-ball in center. Player 1 breaks behind the kitchen line.</li>
              <li><strong className="text-slate-200">Open Table:</strong> Table remains open until the first player legally pockets a solid (1-7) or stripe (9-15).</li>
              <li><strong className="text-slate-200">Winning:</strong> Pocket all 7 of your assigned balls, then legally call and pocket the 8-ball.</li>
            </ul>
          </div>

          <div className="p-3 bg-red-950/30 border border-red-500/30 rounded-xl">
            <h4 className="font-bold text-red-300 mb-1 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-red-400" /> Fouls & Ball in Hand
            </h4>
            <ul className="list-disc list-inside space-y-1 text-slate-300 text-xs">
              <li>Scratching the cue ball into a pocket grants the opponent <strong>Ball in Hand</strong> anywhere on the table.</li>
              <li>Failing to hit your own group ball first gives opponent Ball in Hand.</li>
              <li><strong>Prematurely pocketing the 8-ball</strong> before your group is cleared results in immediate loss!</li>
            </ul>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors"
        >
          Got it, Let's Play!
        </button>
      </div>
    </div>
  );
};

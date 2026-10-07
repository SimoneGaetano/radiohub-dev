interface Props {
  /** Animates the bars only while the audio is playing. */
  playing: boolean;
  /** Track height, e.g. `h-5` in the overlay or `h-3` in the bottom bar. */
  className?: string;
  /** Uses the quicker pulse of the compact bottom bar. */
  mini?: boolean;
}

/**
 * Four green bars that pulse with the playback and stand still when paused.
 */
export function Equalizer({
  playing,
  className = 'h-5',
  mini = false,
}: Props) {
  const animation = mini ? 'eq-bar-mini' : 'eq-bar';

  return (
    <span
      className={`flex shrink-0 items-end gap-[3px] ${className}`}
      aria-hidden="true"
    >
      {[0, 1, 2, 3].map((index) => (
        <span
          key={index}
          style={{
            animationDelay: `${index * 130}ms`,
            height: `${55 + index * 15}%`,
          }}
          className={`w-[3px] rounded-full bg-emerald-400 ${
            playing ? animation : ''
          }`}
        />
      ))}
    </span>
  );
}
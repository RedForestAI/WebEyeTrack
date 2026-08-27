interface GazeDotProps {
  x: number;
  y: number;
  gazeState: string;
}

export default function GazeDot({ x, y, gazeState }: GazeDotProps) {
  const style: React.CSSProperties = {
    position: "fixed",
    zIndex: 100,
    left: "-5px",
    top: "-5px",
    background: "magenta",
    borderRadius: "50%",
    opacity: 0.7,
    width: 30,
    height: 30,
    display: gazeState === "closed" ? "none" : "block",
    transform: `translate(${x}px, ${y}px)`,
  };

  return <div id="GazeDot" style={style}></div>;
}

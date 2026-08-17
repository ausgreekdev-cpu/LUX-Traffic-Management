const PALETTE = ['#0ea5e9', '#6366f1', '#a855f7', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#14b8a6', '#84cc16', '#f97316', '#3b82f6', '#8b5cf6'];

export default function CfdChart({ cfd, columns }) {
  const width = 860;
  const height = 260;
  const padL = 36;
  const padB = 24;
  const padT = 8;
  const padR = 8;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  if (!cfd || !cfd.length || !columns.length) {
    return <div className="text-sm text-gray-500">No flow data yet.</div>;
  }

  const maxY = Math.max(1, ...cfd.map(d => d.total || 0));
  const x = (i) => padL + (i / (cfd.length - 1)) * chartW;
  const y = (v) => padT + chartH - (v / maxY) * chartH;

  const series = columns.map((col, ci) => {
    const color = PALETTE[ci % PALETTE.length];
    const tops = [];
    const bottoms = [];
    let acc = 0;
    for (let i = 0; i < cfd.length; i++) {
      const v = cfd[i].columns[col.id] || 0;
      tops.push({ i, value: acc + v });
      bottoms.push({ i, value: acc });
      acc += v;
    }
    return { col, color, tops, bottoms };
  });

  const pathFor = (series, useTop) => {
    const pts = useTop ? series.tops : series.bottoms;
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    return d + ` L${x(pts[pts.length - 1].i).toFixed(1)},${y(useTop ? pts[pts.length - 1].value : 0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  };

  const gridLines = [0.25, 0.5, 0.75, 1].map(f => ({ v: maxY * f, yy: y(maxY * f) }));
  const labelEvery = Math.max(1, Math.ceil(cfd.length / 8));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-full" role="img" aria-label="Cumulative flow diagram">
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={g.yy} y2={g.yy} stroke="currentColor" strokeOpacity="0.15" strokeDasharray="4 4" />
            <text x={padL - 6} y={g.yy + 3} textAnchor="end" className="text-[10px] fill-current opacity-60">{Math.round(g.v)}</text>
          </g>
        ))}
        {series.map(s => (
          <path key={s.col.id} d={pathFor(s, true)} fill={s.color} fillOpacity="0.75" stroke={s.color} strokeWidth="0.5" />
        ))}
        {cfd.map((d, i) => {
          if (i % labelEvery !== 0 && i !== cfd.length - 1) return null;
          return <text key={d.date} x={x(i)} y={height - 6} textAnchor="middle" className="text-[10px] fill-current opacity-60">{d.date.slice(5)}</text>;
        })}
        {series.map(s => (
          <line key={s.col.id} x1={x(s.tops.length - 1)} x2={x(s.tops.length - 1) + 8} y1={y(s.tops[s.tops.length - 1].value)} y2={y(s.tops[s.tops.length - 1].value)} stroke={s.color} strokeWidth="3" />
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {series.map((s, i) => (
          <span key={s.col.id} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
            {s.col.name}
          </span>
        ))}
      </div>
    </div>
  );
}
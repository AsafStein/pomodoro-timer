export function IconMark({ size }: { size: number }) {
  const ring = Math.round(size * 0.62);
  const stroke = Math.max(6, Math.round(size * 0.055));
  const dot = Math.max(6, Math.round(size * 0.07));
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "#1c1612",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: ring,
          height: ring,
          borderRadius: ring,
          border: `${stroke}px solid #e36a3a`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: dot,
            height: dot,
            borderRadius: dot,
            background: "#f3ecdf",
            marginBottom: Math.round(ring * 0.38),
          }}
        />
      </div>
    </div>
  );
}

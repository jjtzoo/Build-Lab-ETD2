interface HeaderProps {
  title?: string;
  eyebrow?: string;
}

export function Header({
  title = "ELEMENT TD 2 · BUILD LAB",
  eyebrow = "V8 DECISION ENGINE",
}: HeaderProps) {
  return (
    <header className="top">
      <div className="brand">
        <div className="logo" />

        <div>
          <b>{title}</b>
          <span>FULL-STACK RESEARCH & DECISION PLATFORM</span>
        </div>
      </div>

      <span className="eyebrow">{eyebrow}</span>
    </header>
  );
}
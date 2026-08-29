"use client";

import { useState } from "react";

export default function WhatIfPage() {
  const [message] = useState(
    "What If will start from the current Build Lab allocation.",
  );

  return (
    <section className="panel">
      <div className="eyebrow">WHAT IF LAB</div>

      <h1>What If</h1>

      <p className="muted">{message}</p>
    </section>
  );
}
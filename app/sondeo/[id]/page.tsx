"use client";

import { useCallback, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import FaseSondeo from "@/components/sondeo/FaseSondeo";
import FasePlan from "@/components/sondeo/FasePlan";

type Fase = "sondeo" | "plan";

export default function SondeoPage() {
  const params = useParams();
  const router = useRouter();
  const sesionId = Number(params.id);

  const [fase, setFase] = useState<Fase>("sondeo");
  const [feedback, setFeedback] = useState("");
  const [subtemasFallados, setSubtemasFallados] = useState<string[]>([]);

  const manejarSondeoCompleto = useCallback(
    (feedbackFinal: string, subtemasDebiles: string[]) => {
      setFeedback(feedbackFinal);
      setSubtemasFallados(subtemasDebiles);
      setFase("plan");
    },
    []
  );

  if (fase === "plan") {
    return (
      <FasePlan
        sesionId={sesionId}
        feedback={feedback}
        subtemasFallados={subtemasFallados}
        onVolver={() => router.push("/")}
      />
    );
  }

  return <FaseSondeo sesionId={sesionId} onSondeoCompleto={manejarSondeoCompleto} />;
}

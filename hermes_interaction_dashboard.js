(() => {
  const $ = (id) => document.getElementById(id);

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  function setStatus(text, good = true) {
    const el = $("hermesInteractionStatus");
    if (!el) return;
    el.textContent = text;
    el.style.background = good ? "rgba(86,215,165,0.12)" : "rgba(255,125,133,0.12)";
    el.style.color = good ? "#56d7a5" : "#ff7d85";
  }

  function renderSession(session) {
    if (!session || !Array.isArray(session.turns) || !session.turns.length) {
      setText("hermesInteractionTranscript", "Waiting for input.");
      setText("hermesInteractionResponse", "Waiting for Hermes.");
      setText("hermesInteractionSpeak", "Not triggered yet.");
      return;
    }

    const turn = session.turns[session.turns.length - 1];
    setText("hermesInteractionTranscript", turn?.transcript?.text || "Waiting for input.");
    setText(
      "hermesInteractionResponse",
      `${turn?.response?.text || "Waiting for Hermes."}${turn?.response?.source_field ? `\nSource: ${turn.response.source_field}` : ""}`
    );
    if (turn?.tts?.triggered) {
      const ttsText = turn?.tts?.tts_text || turn?.response?.text || "";
      setText(
        "hermesInteractionSpeak",
        `Triggered.\nSource: ${turn?.tts?.source_field || "assistant_response"}\nVoice: ${turn.tts.voiceId || "unknown"}\nTTS text: ${ttsText}\nAudio: ${turn.tts.audioUrl || turn.tts.audioPath || "unavailable"}`
      );
    } else {
      const blocker = turn?.tts?.blocker;
      const fallbackLabel = blocker === "billing_payment_issue"
        ? "Voice unavailable: ElevenLabs billing/payment issue."
        : blocker === "bad_key_scope_or_auth"
          ? "Voice unavailable: ElevenLabs key/auth issue."
          : blocker === "invalid_voice_or_model"
            ? "Voice unavailable: ElevenLabs voice/model issue."
            : "Voice unavailable: no ElevenLabs audio path returned.";
      setText(
        "hermesInteractionSpeak",
        `Fallback.\nSource: ${turn?.tts?.source_field || "assistant_response"}\n${fallbackLabel}\n${turn?.tts?.error || ""}`.trim()
      );
    }
  }

  async function loadSession() {
    try {
      const response = await fetch("/api/hermes-interaction");
      const data = await response.json();
      renderSession(data);
      setStatus("Ready");
    } catch (error) {
      setStatus(`Load failed: ${error.message}`, false);
    }
  }

  async function sendTurn(text) {
    const response = await fetch("/api/hermes-interaction/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Interaction request failed.");
    }
    renderSession(data.session || { turns: [data.turn] });
    if (data.turn?.tts?.triggered && data.turn.tts.audioUrl) {
      const audio = new Audio(data.turn.tts.audioUrl);
      audio.play().catch(() => {});
    }
    return data;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = $("hermesInteractionForm");
    const input = $("hermesInteractionInput");
    const replay = $("hermesInteractionReplay");

    if (!form || !input) {
      return;
    }

    loadSession();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) {
        setStatus("Enter a prompt first.", false);
        return;
      }

      setStatus("Sending...");
      try {
        await sendTurn(text);
        setStatus("Input received. Transcript, response, and speak path updated.");
      } catch (error) {
        setStatus(error.message, false);
        setText("hermesInteractionSpeak", `Blocked.\n${error.message}`);
      }
    });

    if (replay) {
      replay.addEventListener("click", async () => {
        const text = input.value.trim();
        if (!text) {
          setStatus("Nothing to replay.", false);
          return;
        }
        setStatus("Replaying...");
        try {
          await sendTurn(text);
          setStatus("Replay complete.");
        } catch (error) {
          setStatus(error.message, false);
          setText("hermesInteractionSpeak", `Blocked.\n${error.message}`);
        }
      });
    }
  });
})();

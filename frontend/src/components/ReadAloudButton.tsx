import { Square, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLanguage } from "../lib/language";
import { canSpeak, speak, stopSpeaking } from "../lib/speech";

/** Read text aloud for older or low-literacy family members. Hidden if unsupported. */
export function ReadAloudButton({ text, label = "Read aloud" }: { text: string; label?: string }) {
  const [speaking, setSpeaking] = useState(false);
  const { speechLang } = useLanguage();
  useEffect(() => () => stopSpeaking(), []);
  if (!canSpeak()) return null;

  const toggle = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
    } else {
      setSpeaking(true);
      speak(text, speechLang, () => setSpeaking(false));
    }
  };

  return (
    <button type="button" onClick={toggle} aria-pressed={speaking} className="btn-secondary">
      {speaking ? <Square aria-hidden="true" size={18} /> : <Volume2 aria-hidden="true" size={18} />}
      {speaking ? "Stop reading" : label}
    </button>
  );
}

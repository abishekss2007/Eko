import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import type { Language } from "../types";

export const LANGUAGES: { code: Language; label: string; speech: string }[] = [
  { code: "en", label: "English", speech: "en-IN" },
  { code: "hi", label: "हिन्दी (Hindi)", speech: "hi-IN" },
  { code: "ta", label: "தமிழ் (Tamil)", speech: "ta-IN" },
  { code: "bn", label: "বাংলা (Bengali)", speech: "bn-IN" },
  { code: "mr", label: "मराठी (Marathi)", speech: "mr-IN" },
];

interface LanguageState {
  language: Language;
  speechLang: string;
  setLanguage: (code: Language) => void;
}

const LanguageContext = createContext<LanguageState>({ language: "en", speechLang: "en-IN", setLanguage: () => {} });

function parseLanguage(raw: unknown): Language {
  return LANGUAGES.find((l) => l.code === raw)?.code ?? "en";
}

/** AI explanations and read-aloud follow this language; `<html lang>` is kept in sync. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useLocalStorage<Language>("saanssafe.language", parseLanguage, "en");
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const speechLang = LANGUAGES.find((l) => l.code === language)?.speech ?? "en-IN";
  return <LanguageContext.Provider value={{ language, speechLang, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageState {
  return useContext(LanguageContext);
}

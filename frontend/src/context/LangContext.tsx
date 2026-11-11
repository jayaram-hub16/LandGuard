// Language Context — provides lang switching across the whole app
import React, { createContext, useContext, useState, useEffect } from 'react'
import { type LangCode, type Translations, getTranslations } from '../i18n/translations'

interface LangContextType {
  lang: LangCode
  t: Translations
  setLang: (lang: LangCode) => void
  toggleLang: () => void
}

const LangContext = createContext<LangContextType>({
  lang: 'en',
  t: getTranslations('en'),
  setLang: () => {},
  toggleLang: () => {},
})

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(() => {
    const stored = localStorage.getItem('landguard_lang')
    return (stored === 'te' ? 'te' : 'en') as LangCode
  })

  const setLang = (l: LangCode) => {
    setLangState(l)
    localStorage.setItem('landguard_lang', l)
    document.documentElement.setAttribute('lang', l)
  }

  const toggleLang = () => setLang(lang === 'en' ? 'te' : 'en')

  useEffect(() => {
    document.documentElement.setAttribute('lang', lang)
  }, [lang])

  return (
    <LangContext.Provider value={{ lang, t: getTranslations(lang), setLang, toggleLang }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  return useContext(LangContext)
}

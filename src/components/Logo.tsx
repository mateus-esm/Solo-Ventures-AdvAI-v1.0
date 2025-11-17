import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import logoDark from "@/assets/solo-ventures-logo.png";
import logoLight from "@/assets/solo-ventures-logo-light.png";

interface LogoProps {
  className?: string;
  alt?: string;
}

export const Logo = ({ className = "h-8", alt = "Solo Ventures" }: LogoProps) => {
  const { theme, systemTheme, resolvedTheme } = useTheme() as any;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Evita flash e tenta prever o tema inicial
  if (!mounted) {
    const prefersDark = typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return <img src={prefersDark ? logoLight : logoDark} alt={alt} className={className} />;
  }

  // Usa resolvedTheme quando disponível; fallback para classe do <html>
  const currentTheme = (resolvedTheme ?? (theme === "system" ? systemTheme : theme))
    ?? (typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light");
  // Logo branca no modo escuro, logo escura no modo claro
  const logoSrc = currentTheme === "dark" ? logoLight : logoDark;

  return <img src={logoSrc} alt={alt} className={className} />;
};

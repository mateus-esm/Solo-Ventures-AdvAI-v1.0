import { useAuth } from "@/contexts/AuthContext";
import { ExternalLink } from "lucide-react";

const CRM = () => {
  const { equipe } = useAuth();

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="border-b border-border bg-header-bg">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pipeline <span className="text-primary">Comercial</span></h1>
            <p className="text-sm text-foreground/70 mt-1 font-medium">Gestão estratégica do seu funil de vendas</p>
          </div>
          <a 
            href="https://mateussmaia.jestor.fun/object/o_apnte00i6bwtdfd2rjc" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium border border-border bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 transition-colors"
          >
            Acessar Pipeline Comercial
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      <div className="flex-1 relative">
        <iframe src={equipe?.crm_link} className="absolute inset-0 w-full h-full border-0" title="CRM" />
      </div>
    </div>
  );
};

export default CRM;

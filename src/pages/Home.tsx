import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, LayoutDashboard, Headphones } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const Home = () => {
  const { profile, equipe } = useAuth();
  const chatHref = profile?.chat_link_base || "/chat";
  const isExternalChatLink = chatHref.startsWith("http");

  return (
    <div className="flex-1 flex flex-col bg-background">
      <div className="border-b border-border bg-gradient-to-r from-background to-soft-gray">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-foreground text-center">
            AdvAI <span className="text-primary">— {equipe?.nome_cliente || 'Assistente'}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-2 text-center">
            {profile?.nome_completo} • Powered by Solo Ventures ⚡
          </p>
        </div>
      </div>

        {/* Explicação Dinâmica */}
        {equipe?.home_explanation && (
          <div className="border-b border-border bg-gradient-to-r from-soft-gray to-background">
            <div className="container mx-auto px-4 py-6">
              <Card className="border-primary/20">
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground leading-relaxed">
                    {equipe.home_explanation}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        <div className="flex-1 flex items-center justify-center p-4 bg-soft-gray">
          <div className="w-full max-w-4xl">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Chat Button */}
              {isExternalChatLink ? (
                <a
                  href={chatHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Card className="h-full hover:shadow-[var(--shadow-elegant)] transition-all duration-300 hover:scale-105 border-primary/20 cursor-pointer">
                    <CardContent className="flex flex-col items-center justify-center p-8 text-center min-h-[240px]">
                      <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-[hsl(45_100%_60%)] flex items-center justify-center mb-4">
                        <MessageCircle className="h-8 w-8 text-primary-foreground" />
                      </div>
                      <h2 className="text-2xl font-bold text-foreground mb-2">Chat</h2>
                      <p className="text-sm text-muted-foreground">
                        Converse com o assistente jurídico inteligente
                      </p>
                    </CardContent>
                  </Card>
                </a>
              ) : (
                <Link to={chatHref} className="block">
                  <Card className="h-full hover:shadow-[var(--shadow-elegant)] transition-all duration-300 hover:scale-105 border-primary/20 cursor-pointer">
                    <CardContent className="flex flex-col items-center justify-center p-8 text-center min-h-[240px]">
                      <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-[hsl(45_100%_60%)] flex items-center justify-center mb-4">
                        <MessageCircle className="h-8 w-8 text-primary-foreground" />
                      </div>
                      <h2 className="text-2xl font-bold text-foreground mb-2">Chat</h2>
                      <p className="text-sm text-muted-foreground">
                        Converse com o assistente jurídico inteligente
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              )}

              {/* CRM Button */}
              <Link to="/crm" className="block">
                <Card className="h-full hover:shadow-[var(--shadow-elegant)] transition-all duration-300 hover:scale-105 border-primary/20 cursor-pointer">
                  <CardContent className="flex flex-col items-center justify-center p-8 text-center min-h-[240px]">
                    <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-[hsl(45_100%_60%)] flex items-center justify-center mb-4">
                      <LayoutDashboard className="h-8 w-8 text-primary-foreground" />
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">CRM</h2>
                    <p className="text-sm text-muted-foreground">
                      Gestão de projetos e clientes
                    </p>
                  </CardContent>
                </Card>
              </Link>

              {/* Suporte Button */}
              <Link to="/suporte" className="block">
                <Card className="h-full hover:shadow-[var(--shadow-elegant)] transition-all duration-300 hover:scale-105 border-primary/20 cursor-pointer">
                  <CardContent className="flex flex-col items-center justify-center p-8 text-center min-h-[240px]">
                    <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-[hsl(45_100%_60%)] flex items-center justify-center mb-4">
                      <Headphones className="h-8 w-8 text-primary-foreground" />
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">Suporte</h2>
                    <p className="text-sm text-muted-foreground">
                      Envie feedback e tire dúvidas
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>
        </div>
    </div>
  );
};

export default Home;

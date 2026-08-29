import { Link } from "react-router";
import { MessageCircleQuestion, MessageSquareWarning, Lightbulb } from "lucide-react";

interface SidebarProps {
  currentCategory: string;
}

export default function Sidebar({ currentCategory }: SidebarProps) {
  const categories = [
    {
      id: "perguntas",
      label: "Perguntas",
      icon: MessageCircleQuestion,
      path: "/perguntas",
    },
    {
      id: "reclamacoes",
      label: "Reclamações",
      icon: MessageSquareWarning,
      path: "/reclamacoes",
    },
    {
      id: "sugestoes",
      label: "Sugestões",
      icon: Lightbulb,
      path: "/sugestoes",
    },
  ];

  return (
    <aside className="w-[280px] bg-gradient-to-b from-[#1e3a8a] to-[#1e40af] text-white flex flex-col shadow-xl">
      {/* Logo */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
            <span className="font-bold text-[#1e3a8a]">CC</span>
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight">ConnectClass</h1>
            <p className="text-xs text-blue-200">Portal do Aluno</p>
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <nav className="flex-1 p-4 space-y-3">
        {categories.map((category) => {
          const Icon = category.icon;
          const isActive = currentCategory === category.id;

          return (
            <Link
              key={category.id}
              to={category.path}
              className={`
                flex items-center gap-4 p-4 rounded-xl transition-all duration-200
                ${
                  isActive
                    ? "bg-white text-[#1e3a8a] shadow-lg scale-105"
                    : "bg-white/10 hover:bg-white/20 hover:scale-102"
                }
              `}
            >
              <Icon className="w-6 h-6" />
              <span className="font-medium">{category.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Student Info */}
      <div className="p-6 border-t border-white/10 bg-black/10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center font-bold text-lg">
            AM
          </div>
          <div>
            <p className="font-semibold">Ana Maria Santos</p>
            <p className="text-sm text-blue-200">3° Ano - Turma B</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

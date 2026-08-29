import { useState } from "react";
import { Send } from "lucide-react";
import Message from "./Message";

interface ChatMessage {
  id: string;
  text: string;
  sender: "student" | "secretary";
  timestamp: string;
  status?: "Em análise" | "Respondida" | "Concluída";
}

interface ChatAreaProps {
  category: string;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
}

export default function ChatArea({ category, messages, onSendMessage }: ChatAreaProps) {
  const [inputValue, setInputValue] = useState("");

  const getCategoryTitle = () => {
    const titles: Record<string, string> = {
      perguntas: "Perguntas",
      reclamacoes: "Reclamações",
      sugestoes: "Sugestões",
    };
    return titles[category] || "Conversa";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSendMessage(inputValue);
      setInputValue("");
    }
  };

  return (
    <main className="flex-1 flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Secretaria Escolar</h2>
            <p className="text-sm text-gray-500">{getCategoryTitle()}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-600">Online</span>
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Send className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">
                Nenhuma mensagem ainda
              </h3>
              <p className="text-gray-500 text-sm">
                Inicie uma conversa com a secretaria
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <Message key={message.id} message={message} />
          ))
        )}
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Digite sua mensagem..."
            className="flex-1 px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center gap-2"
          >
            <Send className="w-5 h-5" />
            <span>Enviar</span>
          </button>
        </form>
      </div>
    </main>
  );
}

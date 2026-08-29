import { useState } from "react";
import { useParams } from "react-router";
import Sidebar from "../components/Sidebar";
import ChatArea from "../components/ChatArea";

export default function ChatPage() {
  const { category = "perguntas" } = useParams<{ category?: string }>();
  const [messages, setMessages] = useState(getMockMessages(category));

  const handleSendMessage = (text: string) => {
    const newMessage = {
      id: Date.now().toString(),
      text,
      sender: "student",
      timestamp: new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      status: "Em análise" as const,
    };
    setMessages([...messages, newMessage]);
  };

  return (
    <div className="flex h-screen bg-white">
      <Sidebar currentCategory={category} />
      <ChatArea
        category={category}
        messages={messages}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}

function getMockMessages(category: string) {
  const mockData: Record<string, any[]> = {
    perguntas: [
      {
        id: "1",
        text: "Olá! Gostaria de saber quando será divulgado o calendário de provas do segundo bimestre?",
        sender: "student",
        timestamp: "09:15",
        status: "Respondida",
      },
      {
        id: "2",
        text: "Bom dia! O calendário de provas será divulgado na próxima sexta-feira, dia 12/06. Você receberá uma notificação por e-mail e também poderá consultar no portal do aluno.",
        sender: "secretary",
        timestamp: "09:32",
      },
      {
        id: "3",
        text: "Perfeito! Muito obrigado pela resposta rápida.",
        sender: "student",
        timestamp: "09:35",
        status: "Concluída",
      },
      {
        id: "4",
        text: "Disponha! Estamos à disposição para ajudar. 😊",
        sender: "secretary",
        timestamp: "09:36",
      },
    ],
    reclamacoes: [
      {
        id: "1",
        text: "Gostaria de relatar que a internet da biblioteca está muito lenta nos últimos dias, o que tem dificultado o acesso aos materiais de pesquisa.",
        sender: "student",
        timestamp: "14:20",
        status: "Em análise",
      },
      {
        id: "2",
        text: "Obrigado pelo relato. Já encaminhamos sua solicitação para o setor de TI. Eles vão verificar o problema e fazer os ajustes necessários nos próximos dias.",
        sender: "secretary",
        timestamp: "14:45",
      },
      {
        id: "3",
        text: "Entendido. Quando houver uma solução, vocês podem me avisar?",
        sender: "student",
        timestamp: "14:50",
        status: "Respondida",
      },
    ],
    sugestoes: [
      {
        id: "1",
        text: "Sugiro que a escola disponibilize mais opções vegetarianas e veganas na cantina. Muitos alunos têm essas preferências alimentares.",
        sender: "student",
        timestamp: "11:00",
        status: "Em análise",
      },
      {
        id: "2",
        text: "Que ótima sugestão! Vamos encaminhar para a coordenação pedagógica e a empresa responsável pela cantina. Agradecemos pelo feedback construtivo!",
        sender: "secretary",
        timestamp: "11:25",
      },
    ],
  };

  return mockData[category] || mockData.perguntas;
}

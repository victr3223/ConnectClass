interface MessageProps {
  message: {
    id: string;
    text: string;
    sender: "student" | "secretary";
    timestamp: string;
    status?: "Em análise" | "Respondida" | "Concluída";
  };
}

export default function Message({ message }: MessageProps) {
  const isStudent = message.sender === "student";

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "Em análise":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "Respondida":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "Concluída":
        return "bg-green-100 text-green-800 border-green-200";
      default:
        return "";
    }
  };

  return (
    <div className={`flex ${isStudent ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[70%] ${isStudent ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {/* Message Bubble */}
        <div
          className={`
            px-5 py-3 rounded-2xl shadow-sm
            ${
              isStudent
                ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-tr-sm"
                : "bg-white text-gray-800 border border-gray-200 rounded-tl-sm"
            }
          `}
        >
          <p className="leading-relaxed">{message.text}</p>
        </div>

        {/* Timestamp and Status */}
        <div className={`flex items-center gap-2 px-2 ${isStudent ? "flex-row-reverse" : "flex-row"}`}>
          <span className="text-xs text-gray-500">{message.timestamp}</span>
          {message.status && (
            <span
              className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(
                message.status
              )}`}
            >
              {message.status}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

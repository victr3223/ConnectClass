import { useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  User,
  Lock,
  Mail,
  Eye,
  EyeOff,
  BookOpen,
  Hash,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ChevronLeft,
} from "lucide-react";

type View = "login" | "register" | "forgot";

interface FormErrors {
  [key: string]: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const [loginForm, setLoginForm] = useState({ ra: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    name: "",
    ra: "",
    turma: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const validate = (
    form: typeof loginForm | typeof registerForm,
    isRegister: boolean
  ): boolean => {
    const newErrors: FormErrors = {};
    if (isRegister) {
      const r = form as typeof registerForm;
      if (!r.name.trim()) newErrors.name = "Nome completo é obrigatório";
      if (!r.ra.trim()) newErrors.ra = "RA é obrigatório";
      if (!r.turma.trim()) newErrors.turma = "Série/Turma é obrigatória";
      if (!r.email.trim()) newErrors.email = "E-mail é obrigatório";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))
        newErrors.email = "E-mail inválido";
      if (!r.password) newErrors.password = "Senha é obrigatória";
      else if (r.password.length < 6) newErrors.password = "Mínimo 6 caracteres";
      if (!r.confirmPassword) newErrors.confirmPassword = "Confirme sua senha";
      else if (r.password !== r.confirmPassword)
        newErrors.confirmPassword = "Senhas não coincidem";
    } else {
      const l = form as typeof loginForm;
      if (!l.ra.trim()) newErrors.ra = "RA ou e-mail é obrigatório";
      if (!l.password) newErrors.password = "Senha é obrigatória";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate(loginForm, false)) {
      navigate("/perguntas");
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate(registerForm, true)) {
      navigate("/perguntas");
    }
  };

  const handleForgot = (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotEmail.trim()) setForgotSent(true);
  };

  const inputClass = (field: string) =>
    `w-full pl-11 pr-4 py-3 rounded-xl border text-sm outline-none transition-all duration-200 bg-white ${
      errors[field]
        ? "border-red-400 focus:ring-2 focus:ring-red-200"
        : "border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
    }`;

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex w-[45%] bg-gradient-to-br from-[#0f1f5c] via-[#1e3a8a] to-[#1d4ed8] flex-col items-center justify-center relative overflow-hidden p-12">
        <div className="absolute top-[-80px] left-[-80px] w-64 h-64 bg-white/5 rounded-full" />
        <div className="absolute bottom-[-60px] right-[-60px] w-80 h-80 bg-white/5 rounded-full" />
        <div className="absolute top-1/2 right-[-40px] w-48 h-48 bg-blue-400/10 rounded-full" />

        <div className="absolute inset-0 opacity-10">
          {Array.from({ length: 8 }).map((_, r) =>
            Array.from({ length: 6 }).map((_, c) => (
              <div
                key={`${r}-${c}`}
                className="absolute w-1.5 h-1.5 bg-white rounded-full"
                style={{ top: `${r * 14 + 4}%`, left: `${c * 18 + 2}%` }}
              />
            ))
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 flex flex-col items-center text-center"
        >
          <div className="w-24 h-24 bg-white/10 border border-white/20 rounded-2xl flex items-center justify-center mb-6 shadow-2xl backdrop-blur">
            <svg width="52" height="44" viewBox="0 0 52 44" fill="none">
              <rect x="2" y="2" width="30" height="24" rx="5" stroke="white" strokeWidth="2.5" fill="none" />
              <rect x="18" y="16" width="30" height="24" rx="5" fill="#1d4ed8" stroke="white" strokeWidth="2.5" />
              <circle cx="26" cy="28" r="2" fill="white" />
              <circle cx="33" cy="28" r="2" fill="white" />
              <circle cx="40" cy="28" r="2" fill="white" />
              <line x1="9" y1="11" x2="25" y2="11" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <line x1="9" y1="17" x2="20" y2="17" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>

          <h1 className="text-4xl font-bold text-white tracking-tight mb-3">
            Connect<span className="text-blue-300">Class</span>
          </h1>
          <p className="text-blue-100 text-lg font-medium mb-4 max-w-xs leading-snug">
            Conectando alunos e secretaria de forma simples e eficiente.
          </p>
          <p className="text-blue-200/70 text-sm max-w-xs leading-relaxed">
            Envie perguntas, reclamações e sugestões diretamente para a secretaria escolar — tudo em um só lugar.
          </p>

          <div className="mt-10 flex flex-col gap-3 w-full max-w-xs">
            {[
              { icon: <MsgIcon />, text: "Comunicação direta e rápida" },
              { icon: <ShieldIcon />, text: "Ambiente seguro e confiável" },
              { icon: <ClockIcon />, text: "Respostas em tempo real" },
            ].map(({ icon, text }) => (
              <div
                key={text}
                className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3 border border-white/10"
              >
                {icon}
                <span className="text-white/90 text-sm">{text}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {view === "login" && (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.25 }}
                className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8"
              >
                <div className="lg:hidden flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-[#1e3a8a] to-[#1d4ed8] rounded-xl flex items-center justify-center">
                    <span className="text-white font-bold text-sm">CC</span>
                  </div>
                  <span className="font-bold text-[#1e3a8a] text-xl">ConnectClass</span>
                </div>

                <h2 className="text-2xl font-bold text-gray-900 mb-1">
                  Bem-vindo ao ConnectClass
                </h2>
                <p className="text-gray-500 text-sm mb-7">Acesse sua conta para continuar</p>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                      RA ou E-mail
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Ex: 2024001 ou aluno@escola.edu.br"
                        className={inputClass("ra")}
                        value={loginForm.ra}
                        onChange={(e) => setLoginForm({ ...loginForm, ra: e.target.value })}
                      />
                    </div>
                    {errors.ra && <FieldError msg={errors.ra} />}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Senha</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Sua senha"
                        className={inputClass("password") + " pr-11"}
                        value={loginForm.password}
                        onChange={(e) =>
                          setLoginForm({ ...loginForm, password: e.target.value })
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {errors.password && <FieldError msg={errors.password} />}
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <div
                        onClick={() => setRememberMe(!rememberMe)}
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                          rememberMe
                            ? "bg-[#1d4ed8] border-[#1d4ed8]"
                            : "border-gray-300"
                        }`}
                      >
                        {rememberMe && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>
                      <span className="text-gray-600">Lembrar-me</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setView("forgot");
                        setErrors({});
                      }}
                      className="text-[#1d4ed8] hover:underline font-medium"
                    >
                      Esqueci minha senha
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-[#1e3a8a] to-[#1d4ed8] text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-all duration-200 hover:shadow-lg hover:shadow-blue-200 active:scale-95"
                  >
                    Entrar <ArrowRight className="w-4 h-4" />
                  </button>

                  <p className="text-center text-xs text-gray-400">
                    Demo: qualquer RA e senha funcionam
                  </p>

                  <div className="relative my-1">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-100" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-white px-3 text-xs text-gray-400">ou</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setView("register");
                      setErrors({});
                    }}
                    className="w-full border-2 border-[#1e3a8a] text-[#1e3a8a] py-3 rounded-xl font-semibold hover:bg-blue-50 transition-all duration-200 active:scale-95"
                  >
                    Criar Conta
                  </button>
                </form>
              </motion.div>
            )}

            {view === "register" && (
              <motion.div
                key="register"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.25 }}
                className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8"
              >
                <button
                  onClick={() => {
                    setView("login");
                    setErrors({});
                  }}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-[#1e3a8a] mb-5 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Voltar ao login
                </button>

                <h2 className="text-2xl font-bold text-gray-900 mb-1">Criar Conta</h2>
                <p className="text-gray-500 text-sm mb-6">
                  Preencha os dados abaixo para se cadastrar
                </p>

                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                      Nome Completo
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Ex: Ana Maria Santos"
                        className={inputClass("name")}
                        value={registerForm.name}
                        onChange={(e) =>
                          setRegisterForm({ ...registerForm, name: e.target.value })
                        }
                      />
                    </div>
                    {errors.name && <FieldError msg={errors.name} />}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">RA</label>
                      <div className="relative">
                        <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Ex: 2024001"
                          className={inputClass("ra")}
                          value={registerForm.ra}
                          onChange={(e) =>
                            setRegisterForm({ ...registerForm, ra: e.target.value })
                          }
                        />
                      </div>
                      {errors.ra && <FieldError msg={errors.ra} />}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                        Série/Turma
                      </label>
                      <div className="relative">
                        <GraduationCap className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Ex: 3° Ano B"
                          className={inputClass("turma")}
                          value={registerForm.turma}
                          onChange={(e) =>
                            setRegisterForm({ ...registerForm, turma: e.target.value })
                          }
                        />
                      </div>
                      {errors.turma && <FieldError msg={errors.turma} />}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                      E-mail Institucional
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="email"
                        placeholder="Ex: ana.santos@escola.edu.br"
                        className={inputClass("email")}
                        value={registerForm.email}
                        onChange={(e) =>
                          setRegisterForm({ ...registerForm, email: e.target.value })
                        }
                      />
                    </div>
                    {errors.email && <FieldError msg={errors.email} />}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Senha</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Mínimo 6 caracteres"
                        className={inputClass("password") + " pr-11"}
                        value={registerForm.password}
                        onChange={(e) =>
                          setRegisterForm({ ...registerForm, password: e.target.value })
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {errors.password && <FieldError msg={errors.password} />}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                      Confirmar Senha
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Repita sua senha"
                        className={inputClass("confirmPassword") + " pr-11"}
                        value={registerForm.confirmPassword}
                        onChange={(e) =>
                          setRegisterForm({
                            ...registerForm,
                            confirmPassword: e.target.value,
                          })
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {errors.confirmPassword && <FieldError msg={errors.confirmPassword} />}
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-[#1e3a8a] to-[#1d4ed8] text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-all duration-200 hover:shadow-lg hover:shadow-blue-200 active:scale-95 mt-2"
                  >
                    Cadastrar <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              </motion.div>
            )}

            {view === "forgot" && (
              <motion.div
                key="forgot"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.25 }}
                className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8"
              >
                <button
                  onClick={() => {
                    setView("login");
                    setForgotSent(false);
                    setForgotEmail("");
                  }}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-[#1e3a8a] mb-5 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Voltar ao login
                </button>

                {forgotSent ? (
                  <div className="text-center py-6">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-8 h-8 text-green-500" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">E-mail enviado!</h2>
                    <p className="text-gray-500 text-sm">
                      Enviamos instruções para <strong>{forgotEmail}</strong>. Verifique sua caixa de
                      entrada.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                      <BookOpen className="w-6 h-6 text-[#1d4ed8]" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-1">Recuperar Senha</h2>
                    <p className="text-gray-500 text-sm mb-6">
                      Informe seu e-mail institucional e enviaremos instruções de recuperação.
                    </p>
                    <form onSubmit={handleForgot} className="space-y-4">
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="email"
                          placeholder="seu.email@escola.edu.br"
                          className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full bg-gradient-to-r from-[#1e3a8a] to-[#1d4ed8] text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-all hover:shadow-lg hover:shadow-blue-200 active:scale-95"
                      >
                        Enviar Instruções
                      </button>
                    </form>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <p className="text-center text-xs text-gray-400 mt-6">
            © 2026 ConnectClass · Plataforma Escolar Digital
          </p>
        </div>
      </div>
    </div>
  );
}

function FieldError({ msg }: { msg: string }) {
  return (
    <p className="flex items-center gap-1 text-xs text-red-500 mt-1">
      <AlertCircle className="w-3 h-3" /> {msg}
    </p>
  );
}

function MsgIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="flex-shrink-0">
      <rect x="1" y="1" width="10" height="8" rx="2" stroke="#93c5fd" strokeWidth="1.5" />
      <rect x="6" y="7" width="10" height="8" rx="2" fill="#1d4ed8" stroke="#93c5fd" strokeWidth="1.5" />
      <circle cx="9" cy="11" r="1" fill="white" />
      <circle cx="11.5" cy="11" r="1" fill="white" />
      <circle cx="14" cy="11" r="1" fill="white" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="flex-shrink-0">
      <path
        d="M9 1.5L2.5 4.5V9C2.5 12.5 5.5 15.5 9 16.5C12.5 15.5 15.5 12.5 15.5 9V4.5L9 1.5Z"
        stroke="#93c5fd"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M6 9L8 11L12 7"
        stroke="#93c5fd"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="flex-shrink-0">
      <circle cx="9" cy="9" r="7" stroke="#93c5fd" strokeWidth="1.5" />
      <path d="M9 5V9L12 11" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

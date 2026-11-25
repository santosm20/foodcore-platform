
import React, { useState } from 'react'
import AdminApp from './admin/AdminApp.jsx'

import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChefHat,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Gauge,
  Headphones,
  LayoutDashboard,
  Menu,
  Package,
  Play,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  X,
  Zap,
  Pizza,
  Utensils
} from 'lucide-react'

import {
  CustomerRegisterPage,
  CustomerLoginPage,
  RegistrationPendingPage
} from './customer/CustomerAuth.jsx'

import './styles/customer.css'

// =====================================================
// CONFIGURAÇÕES
// =====================================================

const WHATSAPP_URL =
  'https://wa.me/5511976977449?text=Ol%C3%A1!%20Quero%20conhecer%20as%20solu%C3%A7%C3%B5es%20FOODCORE.'

// =====================================================
// PRODUTOS
// =====================================================

const products = [
  {
    id: 'pizza',
    icon: Pizza,
    name: 'FOODCORE Pizza',
    tag: 'PARA PIZZARIAS',
    description:
      'Organize pedidos, comandas, produção e entregas em uma operação integrada.',
    features: [
      'Gestão de pedidos e sabores',
      'Controle de entregas',
      'Cadastro de clientes',
      'Relatórios de vendas'
    ]
  },
  {
    id: 'burger',
    icon: ChefHat,
    name: 'FOODCORE Burger',
    tag: 'PARA HAMBURGUERIAS',
    description:
      'Tenha controle do salão, balcão, delivery e produção em um só lugar.',
    features: [
      'Montagem de pedidos',
      'Controle de adicionais',
      'Gestão de estoque',
      'Acompanhamento da operação'
    ]
  },
  {
    id: 'restaurant',
    icon: Utensils,
    name: 'FOODCORE Restaurant',
    tag: 'PARA RESTAURANTES',
    description:
      'Mais clareza na gestão diária, do atendimento ao fechamento do caixa.',
    features: [
      'Gestão de mesas e comandas',
      'Controle de caixa',
      'Ficha técnica',
      'Indicadores operacionais'
    ]
  }
]

// =====================================================
// BENEFÍCIOS
// =====================================================

const benefits = [
  {
    icon: LayoutDashboard,
    title: 'Tudo em um só lugar',
    text: 'Centralize as informações importantes da operação e reduza tarefas manuais.'
  },
  {
    icon: TrendingUp,
    title: 'Decisões com clareza',
    text: 'Acompanhe indicadores e entenda melhor o desempenho do seu negócio.'
  },
  {
    icon: Clock3,
    title: 'Mais agilidade no dia a dia',
    text: 'Organize processos para sua equipe trabalhar com mais fluidez.'
  },
  {
    icon: ShieldCheck,
    title: 'Controle e organização',
    text: 'Tenha processos mais consistentes e informações acessíveis.'
  }
]

// =====================================================
// PERGUNTAS FREQUENTES
// =====================================================

const faqs = [
  [
    'A FOODCORE atende apenas negócios de alimentação?',
    'Neste primeiro momento, a plataforma é apresentada para pizzarias, hamburguerias e restaurantes. Novos segmentos podem ser incorporados conforme a evolução dos produtos.'
  ],
  [
    'Como faço para conhecer um sistema?',
    'Entre em contato com nossa equipe para conversar sobre a operação do seu negócio e solicitar uma apresentação da solução mais adequada.'
  ],
  [
    'Como funciona a assinatura?',
    'O FOODCORE ERP será alugado por assinatura. Após a confirmação do pagamento, o cliente recebe acesso ao instalador e ativa a licença vinculada a um computador.'
  ],
  [
    'O ERP funciona sem internet?',
    'Sim. A proposta é um funcionamento híbrido: operações compatíveis continuam localmente e sincronizam com a nuvem quando a conexão retorna. A validação periódica da licença exige conexão dentro da janela de tolerância configurada.'
  ],
  [
    'Posso contratar sem conhecer o sistema?',
    'Recomendamos conversar com nossa equipe e conhecer as funcionalidades antes de tomar sua decisão.'
  ]
]

// =====================================================
// COMPONENTES COMPARTILHADOS
// =====================================================

function Logo({ light = false }) {
  return (
    <a
      className={`logo ${light ? 'logo-light' : ''}`}
      href="/#inicio"
      aria-label="FOODCORE início"
    >
      <span className="logo-mark">
        <span />
      </span>

      <span className="logo-name">
        FOOD<span>CORE</span>
        <small>BUSINESS TECHNOLOGY</small>
      </span>
    </a>
  )
}

function Button({
  children,
  href = '#contato',
  secondary = false,
  ...props
}) {
  return (
    <a
      className={`button ${secondary ? 'button-secondary' : ''}`}
      href={href}
      {...props}
    >
      {children}
      <ArrowUpRight size={17} />
    </a>
  )
}

// =====================================================
// LANDING PAGE
// =====================================================

function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeFaq, setActiveFaq] = useState(0)
  const [selectedProduct, setSelectedProduct] = useState('')

  function closeMenu() {
    setMenuOpen(false)
  }

  function selectProduct(productId) {
    setSelectedProduct(productId)
    closeMenu()

    document.getElementById('contato')?.scrollIntoView({
      behavior: 'smooth'
    })
  }

  return (
    <>
      {/* HEADER */}

      <header className="header">
        <div className="container nav-wrap">
          <Logo />

          <button
            className="mobile-toggle"
            onClick={() => setMenuOpen(current => !current)}
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>

          <nav className={menuOpen ? 'nav nav-open' : 'nav'}>
            <a href="#solucoes" onClick={closeMenu}>
              Soluções
            </a>

            <a href="#vantagens" onClick={closeMenu}>
              Por que FOODCORE
            </a>

            <a href="#sobre" onClick={closeMenu}>
              Sobre
            </a>

            <a href="#faq" onClick={closeMenu}>
              Dúvidas
            </a>

            <a
              className="fc-nav-login"
              href="/login"
              onClick={closeMenu}
            >
              Entrar
            </a>

            <a
              className="fc-nav-register"
              href="/cadastro"
              onClick={closeMenu}
            >
              Criar conta
              <ArrowUpRight size={15} />
            </a>

            <Button
              href="#contato"
              onClick={closeMenu}
            >
              Fale com um especialista
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {/* HERO */}

        <section className="hero" id="inicio">
          <div className="hero-glow glow-one" />
          <div className="hero-glow glow-two" />

          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="eyebrow-dot" />
                TECNOLOGIA PARA NEGÓCIOS DE ALIMENTAÇÃO
              </div>

              <h1>
                Sua operação.
                <br />
                <span>Sob controle.</span>
              </h1>

              <p className="hero-lead">
                ERP executável para Windows, com licença por computador
                e funcionamento híbrido: trabalhe mesmo sem internet e
                sincronize seus dados quando a conexão voltar.
              </p>

              <div className="hero-actions">
                <Button href="#solucoes">
                  Conheça nossas soluções
                </Button>

                <a className="text-link" href="#sobre">
                  <span className="play-icon">
                    <Play size={13} fill="currentColor" />
                  </span>
                  Conheça a FOODCORE
                </a>
              </div>

              <div className="hero-proof">
                <div className="proof-icon">
                  <Zap size={17} />
                </div>

                <div>
                  <strong>Gestão conectada</strong>
                  <small>Mais clareza para cada decisão.</small>
                </div>
              </div>
            </div>

            {/* DASHBOARD ILUSTRATIVO */}

            <div className="hero-visual">
              <div className="visual-orbit orbit-a" />
              <div className="visual-orbit orbit-b" />

              <div className="dashboard">
                <div className="dash-top">
                  <div className="dash-brand">
                    <span className="mini-mark">F</span>

                    <div>
                      <b>FOODCORE</b>
                      <small>PAINEL DE GESTÃO</small>
                    </div>
                  </div>

                  <span className="live">
                    <i />
                    VISÃO GERAL
                  </span>
                </div>

                <div className="dash-greeting">
                  <div>
                    <small>QUARTA-FEIRA, 24 DE NOVEMBRO</small>
                    <h3>Visão geral</h3>
                  </div>

                  <span className="dash-period">
                    Últimos 7 dias⌄
                  </span>
                </div>

                <div className="metric-grid">
                  <div className="metric">
                    <small>VENDAS DO PERÍODO</small>

                    <b>
                      R$ 8.450
                      <span className="up">↗ 12,8%</span>
                    </b>

                    <div className="metric-line">
                      <i style={{ width: '76%' }} />
                    </div>
                  </div>

                  <div className="metric">
                    <small>PEDIDOS</small>

                    <b>
                      284
                      <span className="up">↗ 8,2%</span>
                    </b>

                    <div className="metric-line">
                      <i style={{ width: '62%' }} />
                    </div>
                  </div>
                </div>

                <div className="chart-card">
                  <div className="chart-heading">
                    <b>Desempenho de vendas</b>
                    <small>Esta semana</small>
                  </div>

                  <div className="chart">
                    <div className="chart-y">
                      <span>3k</span>
                      <span>2k</span>
                      <span>1k</span>
                      <span>0</span>
                    </div>

                    <svg
                      viewBox="0 0 440 125"
                      preserveAspectRatio="none"
                      role="img"
                      aria-label="Gráfico ilustrativo de vendas"
                    >
                      <defs>
                        <linearGradient
                          id="area"
                          x1="0"
                          x2="0"
                          y1="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#65d6ae"
                            stopOpacity=".28"
                          />

                          <stop
                            offset="100%"
                            stopColor="#65d6ae"
                            stopOpacity="0"
                          />
                        </linearGradient>
                      </defs>

                      <path
                        d="M0 95 C30 82 40 88 70 70 S110 83 145 55 S190 68 220 45 S260 60 295 35 S340 50 370 22 S410 31 440 8 L440 125 L0 125Z"
                        fill="url(#area)"
                      />

                      <path
                        d="M0 95 C30 82 40 88 70 70 S110 83 145 55 S190 68 220 45 S260 60 295 35 S340 50 370 22 S410 31 440 8"
                        fill="none"
                        stroke="#65d6ae"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>

                  <div className="chart-days">
                    <span>SEG</span>
                    <span>TER</span>
                    <span>QUA</span>
                    <span>QUI</span>
                    <span>SEX</span>
                    <span>SÁB</span>
                    <span>DOM</span>
                  </div>
                </div>

                <div className="dash-bottom">
                  <div className="dash-order-icon">
                    <ShoppingBag size={16} />
                  </div>

                  <div>
                    <b>Pedidos organizados</b>
                    <small>
                      Fluxo de operação em um só lugar
                    </small>
                  </div>

                  <span className="dash-check">
                    <Check size={15} />
                  </span>
                </div>
              </div>

              <div className="floating-card float-left">
                <span className="float-icon">
                  <ClipboardList size={17} />
                </span>

                <div>
                  <b>Operação integrada</b>
                  <small>Informações centralizadas</small>
                </div>
              </div>

              <div className="floating-card float-right">
                <span className="float-icon green">
                  <TrendingUp size={17} />
                </span>

                <div>
                  <b>Visão do negócio</b>
                  <small>Decisões mais inteligentes</small>
                </div>
              </div>

              <div className="visual-caption">
                <span />
                INTERFACE ILUSTRATIVA
              </div>
            </div>
          </div>

          <div className="container hero-bottom">
            <span>TECNOLOGIA QUE ACOMPANHA SEU RITMO</span>

            <div>
              <i />
              <i />
              <i />
              <i />
            </div>

            <span>FOODCORE BUSINESS TECHNOLOGY</span>
          </div>
        </section>

        {/* SEGMENTOS */}

        <section className="segment-strip">
          <div className="container segment-inner">
            <span>UMA PLATAFORMA PARA O SEU TIPO DE NEGÓCIO</span>

            <div>
              <span>
                <Pizza /> PIZZARIAS
              </span>

              <span>
                <ChefHat /> HAMBURGUERIAS
              </span>

              <span>
                <Utensils /> RESTAURANTES
              </span>
            </div>
          </div>
        </section>

        {/* SOLUÇÕES */}

        <section className="section solutions" id="solucoes">
          <div className="container">
            <div className="section-heading">
              <div>
                <div className="eyebrow dark-eyebrow">
                  <span className="eyebrow-dot" />
                  NOSSAS SOLUÇÕES
                </div>

                <h2>
                  Seu negócio tem seu ritmo.
                  <br />
                  <span>A gestão precisa acompanhar.</span>
                </h2>
              </div>

              <p>
                Conheça soluções pensadas para os desafios de cada
                operação. Escolha o caminho que faz sentido para sua empresa.
              </p>
            </div>

            <div className="product-grid">
              {products.map(product => {
                const Icon = product.icon

                return (
                  <article
                    className={`product-card ${
                      selectedProduct === product.id
                        ? 'product-selected'
                        : ''
                    }`}
                    key={product.id}
                  >
                    <div className="product-card-top">
                      <span className="product-icon">
                        <Icon size={23} />
                      </span>

                      <span className="product-tag">
                        {product.tag}
                      </span>
                    </div>

                    <h3>{product.name}</h3>

                    <p>{product.description}</p>

                    <ul>
                      {product.features.map(feature => (
                        <li key={feature}>
                          <Check size={15} />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    <button
                      className="product-link"
                      onClick={() => selectProduct(product.id)}
                    >
                      Quero conhecer
                      <ArrowUpRight size={17} />
                    </button>
                  </article>
                )
              })}
            </div>

            <div className="note-line">
              <Sparkles size={16} />
              Soluções em evolução contínua para acompanhar as necessidades
              do seu negócio.
            </div>
          </div>
        </section>

        {/* VANTAGENS */}

        <section className="section benefits" id="vantagens">
          <div className="container benefits-grid">
            <div className="benefits-intro">
              <div className="eyebrow">
                <span className="eyebrow-dot" />
                POR QUE FOODCORE
              </div>

              <h2>
                Menos improviso.
                <br />
                <span>Mais gestão.</span>
              </h2>

              <p>
                Uma operação saudável começa com informação organizada.
                A FOODCORE nasce para aproximar tecnologia da rotina real
                de quem empreende.
              </p>

              <Button href="#contato" secondary>
                Converse com nossa equipe
              </Button>
            </div>

            <div className="benefit-list">
              {benefits.map((benefit, index) => {
                const Icon = benefit.icon

                return (
                  <div className="benefit-item" key={benefit.title}>
                    <div className="benefit-icon">
                      <Icon size={21} />
                    </div>

                    <div>
                      <h3>{benefit.title}</h3>
                      <p>{benefit.text}</p>
                    </div>

                    <span className="benefit-number">
                      0{index + 1}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* SOBRE */}

        <section className="section about" id="sobre">
          <div className="container about-grid">
            <div className="about-art">
              <div className="about-ring ring-one" />
              <div className="about-ring ring-two" />

              <div className="about-core">
                <span className="core-symbol">
                  <span />
                </span>

                <b>FOODCORE</b>
                <small>BUSINESS TECHNOLOGY</small>
              </div>

              <div className="about-chip chip-one">
                <Gauge size={17} />
                GESTÃO
              </div>

              <div className="about-chip chip-two">
                <Package size={17} />
                OPERAÇÃO
              </div>

              <div className="about-chip chip-three">
                <CircleDollarSign size={17} />
                RESULTADOS
              </div>
            </div>

            <div className="about-copy">
              <div className="eyebrow dark-eyebrow">
                <span className="eyebrow-dot" />
                NOSSA VISÃO
              </div>

              <h2>
                Tecnologia deve simplificar.
                <span> Não complicar.</span>
              </h2>

              <p>
                Acreditamos que ferramentas de gestão precisam ser claras,
                úteis e conectadas à realidade de cada empresa.
              </p>

              <p>
                Por isso, a FOODCORE tem um propósito: transformar processos
                do dia a dia em uma operação mais organizada, com informações
                que ajudam você a decidir melhor.
              </p>

              <div className="about-signature">
                <span className="signature-line" />
                <b>FOODCORE</b>
                <small>BUSINESS TECHNOLOGY</small>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}

        <section className="section faq" id="faq">
          <div className="container faq-grid">
            <div>
              <div className="eyebrow dark-eyebrow">
                <span className="eyebrow-dot" />
                DÚVIDAS FREQUENTES
              </div>

              <h2>
                Vamos esclarecer
                <br />
                <span>suas dúvidas.</span>
              </h2>

              <p>
                Quer entender melhor como a FOODCORE pode apoiar sua
                operação? Estamos à disposição.
              </p>
            </div>

            <div className="faq-list">
              {faqs.map(([question, answer], index) => (
                <div
                  className={`faq-item ${
                    activeFaq === index ? 'faq-active' : ''
                  }`}
                  key={question}
                >
                  <button
                    onClick={() =>
                      setActiveFaq(current =>
                        current === index ? -1 : index
                      )
                    }
                    aria-expanded={activeFaq === index}
                  >
                    <span>{question}</span>
                    <ChevronDown size={19} />
                  </button>

                  {activeFaq === index && <p>{answer}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CONTATO */}

        <section className="contact-section" id="contato">
          <div className="container contact-box">
            <div className="contact-orb orb-a" />
            <div className="contact-orb orb-b" />

            <div className="contact-content">
              <div className="eyebrow">
                <span className="eyebrow-dot" />
                VAMOS CONVERSAR
              </div>

              <h2>
                O próximo passo do seu negócio começa com
                <span> uma boa conversa.</span>
              </h2>

              <p>
                Conte um pouco sobre sua empresa. Nossa equipe pode ajudar
                você a encontrar a solução mais adequada.
              </p>

              <a
                className="button button-light"
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Falar pelo WhatsApp
                <ArrowUpRight size={17} />
              </a>

              <small className="contact-disclaimer">
                Atendimento FOODCORE pelo WhatsApp.
              </small>
            </div>

            <div className="contact-side">
              <div className="contact-side-icon">
                <Headphones size={25} />
              </div>

              <b>Atendimento próximo</b>

              <span>
                Entendemos sua operação antes de apresentar uma solução.
              </span>

              <div className="contact-side-line" />
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}

      <footer className="footer">
        <div className="container">
          <div className="footer-main">
            <div>
              <Logo light />

              <p>
                Tecnologia de gestão para negócios que querem evoluir.
              </p>
            </div>

            <div className="footer-links">
              <div>
                <b>PLATAFORMA</b>

                <a href="#solucoes">Soluções</a>
                <a href="#vantagens">Vantagens</a>
                <a href="#sobre">Sobre nós</a>
              </div>

              <div>
                <b>ATENDIMENTO</b>

                <a href="#contato">Fale conosco</a>
                <a href="#faq">Perguntas frequentes</a>
                <a href="/login">Área do cliente</a>
                <a href="/cadastro">Criar conta</a>
                <a href="/admin">Acesso administrativo</a>
              </div>
            </div>
          </div>

          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} FOODCORE. Todos os direitos reservados.
            </span>

            <span>
              BUSINESS TECHNOLOGY <i /> FEITO PARA EVOLUIR
            </span>
          </div>
        </div>
      </footer>
    </>
  )
}

// =====================================================
// APLICAÇÃO E ROTAS
// =====================================================

function App() {
  const pathname =
    window.location.pathname.replace(/\/+$/, '') || '/'

  if (pathname.startsWith('/admin')) {
    return <AdminApp />
  }

  switch (pathname) {
    case '/cadastro':
      return <CustomerRegisterPage />

    case '/login':
      return <CustomerLoginPage />

    case '/aguardando-aprovacao':
      return <RegistrationPendingPage />

    default:
      return <LandingPage />
  }
}

export default App

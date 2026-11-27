
import PDFDocument from 'pdfkit'
import crypto from 'node:crypto'

import { supabase } from '../supabase.js'

// =====================================================
// CONFIGURAÇÕES
// =====================================================

const BUCKET = 'foodcore-contracts'
const MAX_FILE_SIZE = 10 * 1024 * 1024

const DEFAULT_MONTHLY_PRICE = 149.90

const CONTRACTOR = {
  tradeName: process.env.FOODCORE_CONTRACTOR_TRADE_NAME || 'FOODCORE',
  cnpj: process.env.FOODCORE_CONTRACTOR_CNPJ || '',
  legalName: process.env.FOODCORE_CONTRACTOR_LEGAL_NAME || '',
  address: process.env.FOODCORE_CONTRACTOR_ADDRESS || ''
}

const TEST_MODE = process.env.FOODCORE_TEST_MODE === 'true'
const TEST_COMPANY_CNPJ = String(
  process.env.FOODCORE_TEST_COMPANY_CNPJ || ''
).replace(/\D/g, '')

function isAuthorizedTestCompany(company) {
  const companyCnpj = String(company?.cnpj || '').replace(/\D/g, '')

  return Boolean(
    TEST_MODE &&
    TEST_COMPANY_CNPJ &&
    companyCnpj &&
    companyCnpj === TEST_COMPANY_CNPJ
  )
}

const CONTRACT_STATUS = {
  AWAITING_SIGNATURE: 'awaiting_signature',
  AWAITING_APPROVAL: 'awaiting_approval'
}

// =====================================================
// FORMATAÇÃO
// =====================================================

function clean(value) {
  return String(value ?? '').trim()
}

function formatCurrency(value) {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

function formatDate(value = new Date()) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw new Error('Data do contrato inválida.')
  }

  return date.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo'
  })
}

function formatCompanyAddress(company) {
  return [
    clean(company.street),
    clean(company.number)
      ? `nº ${clean(company.number)}`
      : '',
    clean(company.complement),
    clean(company.neighborhood),
    clean(company.city),
    clean(company.state),
    clean(company.postal_code)
      ? `CEP ${clean(company.postal_code)}`
      : ''
  ].filter(Boolean).join(', ')
}

// =====================================================
// VALIDAÇÃO DOS DADOS
// =====================================================

function validateCompanyAndContract(company, contract) {
  if (!company || !contract) {
    throw new Error(
      'Dados da empresa ou contrato não informados.'
    )
  }

  const requiredCompanyFields = [
    ['legal_name', 'Razão social da empresa'],
    ['cnpj', 'CNPJ da empresa'],
    ['representative_name', 'Representante legal'],
    ['representative_cpf', 'CPF do representante']
  ]

  for (const [field, label] of requiredCompanyFields) {
    if (!clean(company[field])) {
      throw new Error(`${label} não informado.`)
    }
  }

  if (!clean(contract.id) || !clean(contract.contract_number)) {
    throw new Error('Dados do contrato incompletos.')
  }

  const price = Number(
    contract.monthly_price ?? DEFAULT_MONTHLY_PRICE
  )

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Valor mensal do contrato inválido.')
  }

  if (!clean(formatCompanyAddress(company))) {
    throw new Error('Endereço da empresa não informado.')
  }
}

function validateContractor(company) {
  if (isAuthorizedTestCompany(company)) {
    return
  }

  const legalName = clean(CONTRACTOR.legalName)
  const address = clean(CONTRACTOR.address)

  if (
    !legalName ||
    !address ||
    /a confirmar|a definir|preencher/i.test(legalName) ||
    /a confirmar|a definir|preencher/i.test(address)
  ) {
    throw new Error(
      'Configure os dados oficiais da CONTRATADA antes de gerar contratos reais.'
    )
  }

  if (!clean(CONTRACTOR.cnpj)) {
    throw new Error('CNPJ da CONTRATADA não informado.')
  }
}

// =====================================================
// COMPONENTES DO PDF
// =====================================================

function addParagraph(doc, text, options = {}) {
  const {
    size = 10,
    align = 'justify',
    ...extraOptions
  } = options

  doc
    .font('Helvetica')
    .fontSize(size)
    .fillColor('#222222')
    .text(clean(text), {
      align,
      lineGap: 4,
      paragraphGap: 2,
      ...extraOptions
    })

  doc.moveDown(0.8)
}

function addSectionTitle(doc, title) {
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#173F35')
    .text(title, {
      align: 'left'
    })

  doc.moveDown(0.5)
}

function addFooter(doc) {
  const bottom = doc.page.height - 35

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#777777')
    .text(
      'FOODCORE | Contrato de Prestação de Serviços e Licença de Uso',
      55,
      bottom,
      {
        width: doc.page.width - 110,
        align: 'center',
        lineBreak: false
      }
    )
}

// =====================================================
// CLÁUSULAS CONTRATUAIS
// =====================================================

function getContractClauses(monthlyPrice) {
  return [
    {
      title: '2. OBJETO',
      paragraphs: [
        'O presente contrato tem por objeto a concessão de licença de uso não exclusiva, pessoal e intransferível do software FOODCORE, destinado à gestão operacional e administrativa de estabelecimentos do segmento de alimentação, conforme as funcionalidades disponibilizadas no plano contratado.',
        'A licença será vinculada à empresa CONTRATANTE e utilizada de acordo com as condições técnicas e comerciais estabelecidas pela CONTRATADA.'
      ]
    },
    {
      title: '3. VALOR E FORMA DE PAGAMENTO',
      paragraphs: [
        `Pela utilização do software, a CONTRATANTE pagará o valor mensal de ${formatCurrency(monthlyPrice)}, mediante PIX ou transferência bancária, conforme as instruções fornecidas pela CONTRATADA.`,
        'O pagamento será considerado efetivado somente após a identificação e aprovação pela CONTRATADA. O envio do comprovante não representa, isoladamente, confirmação de quitação.'
      ]
    },
    {
      title: '4. VIGÊNCIA E RENOVAÇÃO',
      paragraphs: [
        'A licença terá vigência mensal, com renovação condicionada à confirmação do pagamento correspondente ao período contratado.',
        'A data de vencimento será estabelecida no cadastro da assinatura, observadas as regras de cobrança informadas pela CONTRATADA.'
      ]
    },
    {
      title: '5. INADIMPLÊNCIA E SUSPENSÃO',
      paragraphs: [
        'Em caso de atraso no pagamento, será concedido prazo de tolerância de 5 (cinco) dias corridos após a data de vencimento.',
        'Persistindo a inadimplência após o prazo de tolerância, o acesso ao software poderá ser suspenso até a regularização financeira.',
        'A suspensão do acesso não implica exclusão automática dos dados da CONTRATANTE.'
      ]
    },
    {
      title: '6. RESPONSABILIDADES DA CONTRATANTE',
      paragraphs: [
        'A CONTRATANTE é responsável pela veracidade e atualização dos dados cadastrais fornecidos, pela guarda de suas credenciais de acesso e pela utilização adequada do software.',
        'A CONTRATANTE deverá impedir o compartilhamento indevido de credenciais e comunicar à CONTRATADA qualquer suspeita de acesso não autorizado.'
      ]
    },
    {
      title: '7. RESPONSABILIDADES DA CONTRATADA',
      paragraphs: [
        'A CONTRATADA deverá empregar medidas razoáveis de segurança para proteger os dados e as informações armazenadas na plataforma.',
        'A CONTRATADA deverá disponibilizar o software conforme as condições técnicas e comerciais contratadas, ressalvadas manutenções, atualizações e situações de indisponibilidade fora de seu controle razoável.'
      ]
    },
    {
      title: '8. PROTEÇÃO DE DADOS',
      paragraphs: [
        'As partes comprometem-se a observar a legislação aplicável de proteção de dados pessoais, especialmente a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais - LGPD).',
        'Os dados pessoais deverão ser utilizados apenas para finalidades legítimas relacionadas à execução deste contrato, observados os princípios e as obrigações legais aplicáveis.'
      ]
    },
    {
      title: '9. DISPOSIÇÕES GERAIS',
      paragraphs: [
        'A CONTRATANTE declara que leu e compreendeu as condições deste instrumento, comprometendo-se a cumprir suas disposições.',
        'Qualquer alteração das condições comerciais ou contratuais deverá ser formalizada entre as partes.'
      ]
    }
  ]
}

// =====================================================
// GERAÇÃO DO CONTRATO
// =====================================================

export async function generateContractPdf(company, contract) {
  validateCompanyAndContract(company, contract)
  validateContractor(company)

  const monthlyPrice = Number(
    contract.monthly_price ?? DEFAULT_MONTHLY_PRICE
  )

  const companyName = clean(company.legal_name)
  const representativeName = clean(company.representative_name)
  const representativeCpf = clean(company.representative_cpf)
  const companyAddress = formatCompanyAddress(company)
  const documentDate = formatDate()

  return new Promise((resolve, reject) => {
    let completed = false

    const doc = new PDFDocument({
      size: 'A4',
      margins: {
        top: 55,
        bottom: 65,
        left: 55,
        right: 55
      },
      bufferPages: true,
      info: {
        Title: 'Contrato de Prestação de Serviços e Licença de Uso FOODCORE',
        Author: isAuthorizedTestCompany(company)
          ? 'FOODCORE — AMBIENTE DE TESTES'
          : CONTRACTOR.tradeName,
        Subject: 'Contrato de licença de uso de software',
        Creator: 'FOODCORE'
      }
    })

    const chunks = []

    function fail(error) {
      if (completed) return

      completed = true
      reject(error)
    }

    doc.on('data', chunk => {
      chunks.push(chunk)
    })

    doc.on('error', fail)

    doc.on('end', () => {
      if (completed) return

      completed = true
      resolve(Buffer.concat(chunks))
    })

    try {
      // -------------------------------------------------
      // CABEÇALHO
      // -------------------------------------------------

      doc
        .font('Helvetica-Bold')
        .fontSize(24)
        .fillColor('#173F35')
        .text('FOODCORE', {
          align: 'center'
        })

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#666666')
        .text('TECNOLOGIA E GESTÃO PARA RESTAURANTES', {
          align: 'center'
        })

      doc.moveDown(2)

      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#111111')
        .text(
          'CONTRATO DE PRESTAÇÃO DE SERVIÇOS E LICENÇA DE USO DE SOFTWARE',
          {
            align: 'center'
          }
        )

      doc.moveDown(1.5)

      if (isAuthorizedTestCompany(company)) {
        doc
          .font('Helvetica-Bold')
          .fontSize(12)
          .fillColor('#B42318')
          .text('DOCUMENTO DE TESTE — SEM VALIDADE JURÍDICA', {
            align: 'center'
          })
        doc.moveDown(1)
      }

      addParagraph(
        doc,
        `CONTRATO Nº: ${clean(contract.contract_number)}`,
        {
          align: 'left',
          size: 10
        }
      )

      // -------------------------------------------------
      // IDENTIFICAÇÃO DAS PARTES
      // -------------------------------------------------

      addSectionTitle(
        doc,
        '1. IDENTIFICAÇÃO DAS PARTES'
      )

      addParagraph(
        doc,
        `CONTRATANTE: ${companyName}, pessoa jurídica inscrita no CNPJ sob nº ${clean(company.cnpj)}, com sede em ${companyAddress}, neste ato representada por ${representativeName}, CPF nº ${representativeCpf}.`
      )

      const contractorIdentification = isAuthorizedTestCompany(company)
        ? 'CONTRATADA: FOODCORE — AMBIENTE DE TESTES. Os dados cadastrais da fornecedora não estão configurados neste documento fictício, que se destina exclusivamente à validação técnica do fluxo e não possui validade jurídica.'
        : `CONTRATADA: ${CONTRACTOR.tradeName}, inscrita no CNPJ sob nº ${CONTRACTOR.cnpj}, razão social ${CONTRACTOR.legalName}, com endereço em ${CONTRACTOR.address}.`

      addParagraph(doc, contractorIdentification)

      // -------------------------------------------------
      // CLÁUSULAS
      // -------------------------------------------------

      const clauses = getContractClauses(monthlyPrice)

      for (const clause of clauses) {
        addSectionTitle(doc, clause.title)

        for (const paragraph of clause.paragraphs) {
          addParagraph(doc, paragraph)
        }
      }

      // -------------------------------------------------
      // LOCAL E DATA
      // -------------------------------------------------

      doc.moveDown(1)

      addParagraph(
        doc,
        `${clean(company.city) || 'Local'}, ${documentDate}.`,
        {
          align: 'left'
        }
      )

      // -------------------------------------------------
      // ASSINATURA
      // -------------------------------------------------

      doc.moveDown(2)

      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#222222')
        .text('________________________________________', {
          align: 'center'
        })

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(representativeName, {
          align: 'center'
        })

      doc
        .font('Helvetica')
        .fontSize(9)
        .text('Representante legal da CONTRATANTE', {
          align: 'center'
        })

      // -------------------------------------------------
      // RODAPÉ
      // -------------------------------------------------

      const pageRange = doc.bufferedPageRange()

      for (
        let page = pageRange.start;
        page < pageRange.start + pageRange.count;
        page++
      ) {
        doc.switchToPage(page)
        addFooter(doc)
      }

      doc.end()

    } catch (error) {
      fail(error)

      try {
        doc.destroy()
      } catch {
        // Documento já encerrado.
      }
    }
  })
}

// =====================================================
// VALIDAÇÃO ESTRUTURAL DO PDF
// =====================================================

function validatePdf(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
    throw new Error('Arquivo PDF inválido ou vazio.')
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error('O arquivo ultrapassa o limite de 10 MB.')
  }

  const header = buffer
    .subarray(0, 5)
    .toString('ascii')

  if (header !== '%PDF-') {
    throw new Error('O arquivo enviado não é um PDF válido.')
  }

  const tail = buffer
    .subarray(Math.max(0, buffer.length - 2048))
    .toString('latin1')

  if (!tail.includes('%%EOF')) {
    throw new Error('O PDF não possui marcador de encerramento.')
  }

  return true
}

// =====================================================
// REMOÇÃO DE ARQUIVO DO STORAGE
// =====================================================

async function removeStorageFile(path) {
  if (!supabase || !path) {
    return
  }

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([path])

  if (error) {
    console.error(
      '[FOODCORE] Erro ao remover arquivo do Storage:',
      error.message
    )
  }
}

// =====================================================
// ENVIO DO CONTRATO ASSINADO
// =====================================================

export async function uploadSignedContract(
  companyId,
  contractId,
  file
) {
  if (!supabase) {
    throw new Error('Supabase não configurado.')
  }

  if (!companyId || !contractId) {
    throw new Error('Empresa ou contrato não informado.')
  }

  if (!file?.buffer) {
    throw new Error('Arquivo não informado.')
  }

  if (
    file.mimetype !== 'application/pdf' ||
    !/\.pdf$/i.test(file.originalname || '')
  ) {
    throw new Error('Envie um arquivo PDF válido.')
  }

  validatePdf(file.buffer)

  // ---------------------------------------------------
  // CAMINHO ÚNICO DO DOCUMENTO
  // ---------------------------------------------------

  const fileName = `${crypto.randomUUID()}.pdf`

  const filePath = [
    companyId,
    contractId,
    fileName
  ].join('/')

  // ---------------------------------------------------
  // ARMAZENAMENTO PRIVADO
  // ---------------------------------------------------

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file.buffer, {
      contentType: 'application/pdf',
      cacheControl: '3600',
      upsert: false
    })

  if (uploadError) {
    throw uploadError
  }

  // ---------------------------------------------------
  // ATUALIZAÇÃO CONDICIONAL DO CONTRATO
  // ---------------------------------------------------

  let data

  try {
    const result = await supabase
      .from('contracts')
      .update({
        signed_file_path: filePath,
        signed_at: new Date().toISOString(),
        status: CONTRACT_STATUS.AWAITING_APPROVAL
      })
      .eq('id', contractId)
      .eq('company_id', companyId)
      .eq('status', CONTRACT_STATUS.AWAITING_SIGNATURE)
      .select(`
        id,
        contract_number,
        status,
        signed_at
      `)
      .maybeSingle()

    if (result.error) {
      throw result.error
    }

    data = result.data

    if (!data) {
      throw new Error(
        'O contrato não está mais aguardando assinatura.'
      )
    }

  } catch (error) {
    await removeStorageFile(filePath)
    throw error
  }

  return {
    ...data,
    signatureVerification: 'manual_required',
    manualVerificationRequired: true,
    message: 'Contrato recebido e aguardando análise administrativa da assinatura digital.'
  }
}

// =====================================================
// DOWNLOAD DO CONTRATO ASSINADO
// =====================================================

export async function getContractFile(path) {
  if (!supabase) {
    throw new Error('Supabase não configurado.')
  }

  if (!path || typeof path !== 'string') {
    throw new Error('Caminho do contrato inválido.')
  }

  const normalizedPath = path.trim()

  if (
    normalizedPath.startsWith('/') ||
    normalizedPath.includes('..') ||
    normalizedPath.includes('\\')
  ) {
    throw new Error('Caminho do contrato inválido.')
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(normalizedPath)

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error('Arquivo do contrato não encontrado.')
  }

  const buffer = Buffer.from(
    await data.arrayBuffer()
  )

  validatePdf(buffer)

  return buffer
}

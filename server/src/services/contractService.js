
import PDFDocument from 'pdfkit'
import crypto from 'node:crypto'

import { supabase } from '../supabase.js'

// =====================================================
// CONFIGURAÇÕES
// =====================================================

const BUCKET = 'foodcore-contracts'
const MAX_FILE_SIZE = 10 * 1024 * 1024

const DEFAULT_MONTHLY_PRICE = 149.90

// Identificação temporária da CONTRATADA.
// Confirmar razão social e endereço antes do uso comercial.

const CONTRACTOR = {
  tradeName: 'FOODCORE',
  cnpj: '37.210.873/0001-39',
  legalName: 'Razão social a confirmar',
  address: 'Endereço empresarial a confirmar'
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
  return new Date(value).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo'
  })
}

function formatCompanyAddress(company) {
  const address = [
    clean(company.street),
    clean(company.number) ? `nº ${clean(company.number)}` : '',
    clean(company.complement),
    clean(company.neighborhood),
    clean(company.city),
    clean(company.state),
    clean(company.postal_code)
      ? `CEP ${clean(company.postal_code)}`
      : ''
  ].filter(Boolean)

  return address.join(', ')
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

  if (!clean(company.legal_name)) {
    throw new Error(
      'Razão social da empresa não informada.'
    )
  }

  if (!clean(company.cnpj)) {
    throw new Error(
      'CNPJ da empresa não informado.'
    )
  }

  if (!clean(company.representative_name)) {
    throw new Error(
      'Representante legal não informado.'
    )
  }

  if (!clean(company.representative_cpf)) {
    throw new Error(
      'CPF do representante não informado.'
    )
  }

  if (!clean(contract.id) || !clean(contract.contract_number)) {
    throw new Error(
      'Dados do contrato incompletos.'
    )
  }

  const price = Number(
    contract.monthly_price ?? DEFAULT_MONTHLY_PRICE
  )

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(
      'Valor mensal do contrato inválido.'
    )
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
// GERAÇÃO DO CONTRATO
// =====================================================

export async function generateContractPdf(company, contract) {
  validateCompanyAndContract(company, contract)

  const monthlyPrice = Number(
    contract.monthly_price ?? DEFAULT_MONTHLY_PRICE
  )

  const companyName = clean(company.legal_name)
  const representativeName = clean(company.representative_name)
  const address = formatCompanyAddress(company)

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
        Author: 'FOODCORE',
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
        `CONTRATANTE: ${companyName}, pessoa jurídica inscrita no CNPJ sob nº ${clean(company.cnpj)}, com sede em ${address || 'endereço não informado'}, neste ato representada por ${representativeName}, CPF nº ${clean(company.representative_cpf)}.`
      )

      addParagraph(
        doc,
        `CONTRATADA: ${CONTRACTOR.tradeName}, inscrita no CNPJ sob nº ${CONTRACTOR.cnpj}, razão social ${CONTRACTOR.legalName}, com endereço em ${CONTRACTOR.address}.`
      )

      // -------------------------------------------------
      // CLÁUSULAS CONTRATUAIS
      // -------------------------------------------------

      const clauses = [
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
      // AVISO CONTRATUAL
      // -------------------------------------------------

      doc.moveDown(2)

      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#777777')
        .text(
          'Identificação empresarial da CONTRATADA informada provisoriamente. Os dados cadastrais deverão ser confirmados antes da utilização comercial definitiva deste instrumento.',
          {
            align: 'center',
            lineGap: 3
          }
        )

      // -------------------------------------------------
      // RODAPÉ DAS PÁGINAS
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
        // O documento já pode estar encerrado.
      }
    }
  })
}

// =====================================================
// VALIDAÇÃO DO PDF
// =====================================================

function validatePdf(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
    throw new Error(
      'Arquivo PDF inválido ou vazio.'
    )
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(
      'O arquivo ultrapassa o limite de 10 MB.'
    )
  }

  const header = buffer.subarray(0, 5).toString('ascii')

  if (header !== '%PDF-') {
    throw new Error(
      'O arquivo enviado não é um PDF válido.'
    )
  }

  const tail = buffer
    .subarray(Math.max(0, buffer.length - 2048))
    .toString('latin1')

  if (!tail.includes('%%EOF')) {
    throw new Error(
      'O PDF não possui marcador de encerramento.'
    )
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
    throw new Error(
      'Supabase não configurado.'
    )
  }

  if (!companyId || !contractId) {
    throw new Error(
      'Empresa ou contrato não informado.'
    )
  }

  if (!file?.buffer) {
    throw new Error(
      'Arquivo não informado.'
    )
  }

  if (
    file.mimetype !== 'application/pdf' ||
    !file.originalname?.toLowerCase().endsWith('.pdf')
  ) {
    throw new Error(
      'Envie um arquivo PDF válido.'
    )
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
  // UPLOAD PARA O STORAGE PRIVADO
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
  // ATUALIZAÇÃO DO CONTRATO
  // ---------------------------------------------------

  const {
    data,
    error: updateError
  } = await supabase
    .from('contracts')
    .update({
      signed_file_path: filePath,
      signed_at: new Date().toISOString(),
      status: 'awaiting_approval'
    })
    .eq('id', contractId)
    .eq('company_id', companyId)
    .eq('status', 'awaiting_signature')
    .select(`
      id,
      contract_number,
      status,
      signed_at
    `)
    .maybeSingle()

  if (updateError || !data) {
    await removeStorageFile(filePath)

    throw updateError || new Error(
      'O contrato não está mais aguardando assinatura.'
    )
  }

  return {
    ...data,
    signatureVerification: 'manual_required',
    manualVerificationRequired: true,
    message: 'Contrato recebido e aguardando análise do administrador.'
  }
}

// =====================================================
// DOWNLOAD DO CONTRATO ASSINADO
// =====================================================

export async function getContractFile(path) {
  if (!supabase) {
    throw new Error(
      'Supabase não configurado.'
    )
  }

  if (!path || typeof path !== 'string') {
    throw new Error(
      'Caminho do contrato inválido.'
    )
  }

  const normalizedPath = path.trim()

  if (
    normalizedPath.startsWith('/') ||
    normalizedPath.includes('..') ||
    normalizedPath.includes('\\')
  ) {
    throw new Error(
      'Caminho do contrato inválido.'
    )
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(normalizedPath)

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error(
      'Arquivo do contrato não encontrado.'
    )
  }

  return Buffer.from(
    await data.arrayBuffer()
  )
}

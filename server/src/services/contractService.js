
import PDFDocument from 'pdfkit'
import { supabase } from '../supabase.js'

const BUCKET = 'foodcore-contracts'
const MAX_FILE_SIZE = 10 * 1024 * 1024

// --------------------------------------------------
// FORMATAÇÃO
// --------------------------------------------------

function formatCurrency(value) {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

function formatDate(value = new Date()) {
  return new Date(value).toLocaleDateString('pt-BR')
}

function clean(value) {
  return String(value ?? '').trim()
}

// --------------------------------------------------
// GERAÇÃO DO CONTRATO
// --------------------------------------------------

function addParagraph(doc, text, options = {}) {
  const {
    size = 10,
    align = 'justify',
    ...extraOptions
  } = options

  doc
    .font('Helvetica')
    .fontSize(size)
    .text(text, {
      align,
      lineGap: 4,
      ...extraOptions
    })

  doc.moveDown(0.8)
}

function validateCompanyAndContract(company, contract) {
  if (!company || !contract) {
    throw new Error(
      'Dados da empresa ou contrato não informados.'
    )
  }

  if (!company.legal_name || !company.cnpj) {
    throw new Error(
      'Os dados cadastrais da empresa estão incompletos.'
    )
  }

  if (!company.representative_name) {
    throw new Error(
      'Representante legal não informado.'
    )
  }

  if (!contract.id || !contract.contract_number) {
    throw new Error('Dados do contrato incompletos.')
  }

  const price = Number(contract.monthly_price ?? 149.90)

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Valor mensal do contrato inválido.')
  }
}

export async function generateContractPdf(company, contract) {
  validateCompanyAndContract(company, contract)

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: {
        top: 55,
        bottom: 55,
        left: 55,
        right: 55
      },
      info: {
        Title: 'Contrato de Licença de Uso FOODCORE',
        Author: 'FOODCORE'
      }
    })

    const chunks = []

    doc.on('data', chunk => chunks.push(chunk))

    doc.on('end', () => {
      resolve(Buffer.concat(chunks))
    })

    doc.on('error', reject)

    try {
      doc
        .font('Helvetica-Bold')
        .fontSize(22)
        .fillColor('#173F35')
        .text('FOODCORE', { align: 'center' })

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#555555')
        .text('TECNOLOGIA E GESTÃO PARA RESTAURANTES', {
          align: 'center'
        })

      doc.moveDown(2)

      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor('#111111')
        .text(
          'CONTRATO DE PRESTAÇÃO DE SERVIÇOS E LICENÇA DE USO DE SOFTWARE',
          { align: 'center' }
        )

      doc.moveDown(1.5)

      addParagraph(
        doc,
        `CONTRATO Nº: ${clean(contract.contract_number)}`
      )

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('1. IDENTIFICAÇÃO DAS PARTES')

      doc.moveDown(0.5)

      addParagraph(
        doc,
        `CONTRATANTE: ${clean(company.legal_name)}, pessoa jurídica inscrita no CNPJ sob nº ${clean(company.cnpj)}, com sede em ${clean(company.street)}, nº ${clean(company.number)}, ${clean(company.neighborhood)}, ${clean(company.city)} - ${clean(company.state)}, CEP ${clean(company.postal_code)}, neste ato representada por ${clean(company.representative_name)}, CPF nº ${clean(company.representative_cpf)}.`
      )

      addParagraph(
        doc,
        'CONTRATADA: FOODCORE, pessoa jurídica fornecedora da plataforma de software, cuja qualificação empresarial completa deverá ser inserida antes da disponibilização comercial deste instrumento.'
      )

      const clauses = [
        {
          title: '2. OBJETO',
          paragraphs: [
            'O presente contrato tem por objeto a concessão de licença de uso não exclusiva, pessoal e intransferível do software FOODCORE, destinado à gestão operacional e administrativa de estabelecimentos do segmento de alimentação, conforme funcionalidades disponibilizadas no plano contratado.'
          ]
        },
        {
          title: '3. VALOR E PAGAMENTO',
          paragraphs: [
            `Pela utilização do software, a CONTRATANTE pagará o valor mensal de ${formatCurrency(contract.monthly_price ?? 149.90)}, mediante PIX ou transferência bancária, conforme instruções fornecidas pela CONTRATADA.`,
            'A confirmação do pagamento dependerá da análise e aprovação do comprovante enviado pela CONTRATANTE.'
          ]
        },
        {
          title: '4. VIGÊNCIA E RENOVAÇÃO',
          paragraphs: [
            'A licença terá vigência mensal, com renovação condicionada à confirmação do pagamento correspondente ao período contratado.'
          ]
        },
        {
          title: '5. INADIMPLÊNCIA E SUSPENSÃO',
          paragraphs: [
            'Em caso de atraso, será concedido prazo de tolerância de 5 (cinco) dias corridos após o vencimento. Persistindo a inadimplência, o acesso ao software poderá ser suspenso até a regularização, sem exclusão automática dos dados da CONTRATANTE.'
          ]
        },
        {
          title: '6. RESPONSABILIDADES',
          paragraphs: [
            'A CONTRATANTE é responsável pela guarda de suas credenciais de acesso, pela veracidade dos dados fornecidos e pela utilização adequada do software.',
            'A CONTRATADA deverá empregar medidas razoáveis de segurança e manter os serviços conforme as condições comerciais e técnicas contratadas.'
          ]
        },
        {
          title: '7. PROTEÇÃO DE DADOS',
          paragraphs: [
            'As partes comprometem-se a observar a legislação aplicável de proteção de dados pessoais, especialmente a Lei nº 13.709/2018 (LGPD), utilizando os dados pessoais apenas para finalidades legítimas relacionadas à execução deste contrato.'
          ]
        },
        {
          title: '8. DISPOSIÇÕES GERAIS',
          paragraphs: [
            'As partes declaram que leram e compreenderam as condições deste instrumento, comprometendo-se a cumprir suas disposições.'
          ]
        }
      ]

      for (const clause of clauses) {
        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .text(clause.title)

        doc.moveDown(0.5)

        for (const paragraph of clause.paragraphs) {
          addParagraph(doc, paragraph)
        }
      }

      doc.moveDown(1)

      addParagraph(
        doc,
        `${clean(company.city) || 'Local'}, ${formatDate()}`,
        { align: 'left' }
      )

      doc.moveDown(2)

      doc
        .font('Helvetica')
        .fontSize(10)
        .text('________________________________________', {
          align: 'center'
        })

      doc
        .font('Helvetica-Bold')
        .text(clean(company.representative_name), {
          align: 'center'
        })

      doc
        .font('Helvetica')
        .text('Representante da CONTRATANTE', {
          align: 'center'
        })

      doc.moveDown(2)

      doc
        .fontSize(8)
        .fillColor('#777777')
        .text(
          'Documento gerado eletronicamente pela plataforma FOODCORE. A versão definitiva deste contrato depende da identificação completa da CONTRATADA e de revisão jurídica.',
          { align: 'center' }
        )

      doc.end()
    } catch (error) {
      doc.destroy()
      reject(error)
    }
  })
}

// --------------------------------------------------
// VALIDAÇÃO BÁSICA DO PDF
// --------------------------------------------------

function validatePdf(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
    throw new Error('Arquivo PDF inválido ou vazio.')
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error('O arquivo ultrapassa o limite de 10 MB.')
  }

  const header = buffer.subarray(0, 1024).toString('latin1')

  if (!header.startsWith('%PDF-')) {
    throw new Error('O arquivo enviado não é um PDF válido.')
  }

  const content = buffer.toString('latin1')

  if (!content.includes('%%EOF')) {
    throw new Error(
      'O PDF não possui marcador de encerramento.'
    )
  }

  return true
}

// --------------------------------------------------
// ENVIO E ARMAZENAMENTO DO CONTRATO ASSINADO
// --------------------------------------------------

export async function uploadSignedContract(
  companyId,
  contractId,
  file
) {
  if (!supabase) {
    throw new Error('Supabase não configurado.')
  }

  if (!companyId || !contractId) {
    throw new Error(
      'Empresa ou contrato não informado.'
    )
  }

  if (!file?.buffer) {
    throw new Error('Arquivo não informado.')
  }

  if (
    file.mimetype !== 'application/pdf' ||
    !file.originalname?.toLowerCase().endsWith('.pdf')
  ) {
    throw new Error('Envie um arquivo PDF válido.')
  }

  // Confere o formato básico do arquivo.
  // Não realiza validação criptográfica da assinatura.
  validatePdf(file.buffer)

  const path =
    `${companyId}/${contractId}/contrato-assinado.pdf`

  // Armazena o documento original no bucket privado.
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file.buffer, {
      contentType: 'application/pdf',
      upsert: false
    })

  if (uploadError) {
    throw uploadError
  }

  // Atualiza somente o contrato pertencente à empresa
  // que ainda está aguardando assinatura.
  const { data, error: updateError } = await supabase
    .from('contracts')
    .update({
      signed_file_path: path,
      signed_at: new Date().toISOString(),
      status: 'awaiting_approval'
    })
    .eq('id', contractId)
    .eq('company_id', companyId)
    .eq('status', 'awaiting_signature')
    .select('id, contract_number, status, signed_at')
    .maybeSingle()

  // Se o registro falhar, remove o arquivo enviado.
  if (updateError || !data) {
    const { error: removeError } = await supabase.storage
      .from(BUCKET)
      .remove([path])

    if (removeError) {
      console.error(
        '[FOODCORE] Falha ao remover arquivo não registrado:',
        removeError.message
      )
    }

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

// --------------------------------------------------
// DOWNLOAD DO CONTRATO ASSINADO
// --------------------------------------------------

export async function getContractFile(path) {
  if (!supabase) {
    throw new Error('Supabase não configurado.')
  }

  if (!path || typeof path !== 'string') {
    throw new Error('Caminho do contrato inválido.')
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(path)

  if (error) {
    throw error
  }

  return Buffer.from(await data.arrayBuffer())
}

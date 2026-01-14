// Flujo completo del Agente Arquitecto Socrático (en español)
// Define las fases y preguntas base. Algunas fases añaden pasos dinámicos.

export const DEFAULT_FLOW = [
  // Fase 0: Contextualización del Programa
  { id: 'program_name', phase: 'Fase 0', title: 'Nombre del programa', prompt: 'Por favor, dime el nombre exacto del programa, servicio o producto académico que vamos a analizar hoy.' },
  { id: 'program_objective', phase: 'Fase 0', title: 'Objetivo del programa', prompt: '¿Cuál es el objetivo principal de este programa? ¿Qué "transformación" promete?' },

  // Fase 1: Definición del Cliente Ideal
  { id: 'buyer_demographics', phase: 'Fase 1', title: 'Cliente ideal (demografía)', prompt: '¿Quién es la persona ideal para comprar este programa? Descríbemela: ¿Qué edad tiene? ¿Qué ocupación? ¿Qué nivel educativo tiene actualmente?' },
  { id: 'buyer_aspirations', phase: 'Fase 1', title: 'Cliente ideal (aspiraciones)', prompt: '¿Qué busca esa persona en la vida? ¿Cuáles son sus sueños o aspiraciones profesionales o personales?' },
  { id: 'buyer_fears', phase: 'Fase 1', title: 'Cliente ideal (miedos)', prompt: '¿Cuáles son sus miedos, frustraciones o problemas actuales si no hace nada?' },

  // Fase 2: El Problema y los Puntos de Dolor
  { id: 'surface_problem', phase: 'Fase 2', title: 'Problema superficial', prompt: 'Cuando un cliente potencial te contacta, ¿cuál es el problema que él cree que tiene y te menciona primero?' },
  { id: 'root_problem', phase: 'Fase 2', title: 'Problema raíz', prompt: 'Basado en tu experiencia, ¿cuál es el problema real y más profundo que tú sabes que tiene, aunque él no te lo diga?' },
  { id: 'consequences', phase: 'Fase 2', title: 'Consecuencias', prompt: '¿Qué pasa en la vida de esa persona si no resuelve ese problema?' },

  // Fase 3: La Solución (Características del Producto)
  { id: 'features', phase: 'Fase 3', title: 'Características del programa', prompt: 'Enumera las 3 a 5 características principales de este programa. Sé lo más fáctico posible. (Ej: "Duración", "Modalidad", "Certificación que entrega", "Plataforma que usa", "Tipo de profesores", etc.)' },

  // Fase 4: La Propuesta de Valor (Traducción de Beneficios)
  // Nota: aquí se insertan dinámicamente pasos por cada característica (translation_1..N)
  { id: 'value_synthesis', phase: 'Fase 4', title: 'Síntesis de valor', prompt: 'Basado en estos beneficios, ¿cómo resumirías la propuesta única de valor en una sola frase? "Ayudamos a [Cliente Ideal] a [Resolver Problema] para que pueda [Beneficio/Aspiración]"' },

  // Fase 5: Manejo de Objeciones y Fricción
  { id: 'main_objection', phase: 'Fase 5', title: 'Objeción principal', prompt: '¿Cuál es la objeción número uno que siempre, o casi siempre, te da para no comprar?' },
  { id: 'response_main_objection', phase: 'Fase 5', title: 'Respuesta a objeción principal', prompt: '¿Cuál es la respuesta más efectiva que has encontrado para esa objeción?' },
  { id: 'other_objections', phase: 'Fase 5', title: 'Otras objeciones', prompt: '¿Qué otras 2 o 3 objeciones son muy comunes? (Ej: Precio, tiempo, legalidad, competencia, "no soy capaz", etc.)' },
  { id: 'responses_objections', phase: 'Fase 5', title: 'Respuestas a objeciones', prompt: '¿Y cómo respondemos a cada una de ellas?' },

  // Fase 6: Diferenciación y Competencia
  { id: 'competition', phase: 'Fase 6', title: 'Competencia', prompt: '¿Contra quién o qué te compara el cliente? ¿Quién es tu competencia directa e indirecta?' },
  { id: 'differentiator', phase: 'Fase 6', title: 'Diferenciador clave', prompt: '¿Cuál es la razón clave por la que deberían elegirte a ti y no a la competencia? ¿Qué tienes tú que ellos no tengan?' },

  // Fase 7: Cierre y Síntesis
  { id: 'authority', phase: 'Fase 7', title: 'Prueba/Autoridad', prompt: '¿Hay algún dato, estadística, testimonio o acreditación que debamos usar para generar confianza inmediata?' },
  { id: 'cta', phase: 'Fase 7', title: 'Llamado a la acción', prompt: 'Finalmente, ¿cuál es el llamado a la acción ideal? ¿Qué quieres que el cliente haga al final de la conversación (inscribirse, agendar una cita, pagar)?' },
]

// Constructor de pasos de traducción por característica (Fase 4)
export function buildTranslationSteps(features = []) {
  const list = Array.isArray(features) ? features : []
  return list.map((feat, idx) => ({
    id: `translation_${idx + 1}`,
    phase: 'Fase 4',
    title: `Traducción de beneficio ${idx + 1}`,
    prompt: `Tomemos la característica: "${String(feat).trim()}". ¿Por qué eso le importa a tu cliente ideal? ¿Qué beneficio directo obtiene?`,
    feature: String(feat).trim(),
  }))
}

// Mapa de secciones a flujos específicos (puede ampliarse)
const SECTION_FLOWS = {
  'Tarifas': [
    { id: 'tarifas', phase: 'Fase 3', title: 'Detalle de tarifas', prompt: 'Especifica precios, descuentos, vigencias y políticas de devolución.' },
    { id: 'financiacion', phase: 'Fase 3', title: 'Financiación', prompt: 'Explica planes de financiación, requisitos y ejemplos de cuotas.' },
    { id: 'comparativo', phase: 'Fase 4', title: 'Comparativo de valor', prompt: 'Justifica la inversión comparando con alternativas y beneficios.' },
  ],
  'Información general': DEFAULT_FLOW,
}

export function getFlowForSection(sectionName) {
  if (!sectionName) return DEFAULT_FLOW
  return SECTION_FLOWS[sectionName] || DEFAULT_FLOW
}
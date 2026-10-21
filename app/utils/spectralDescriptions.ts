/** Plain-language reading of the existing indices; no field diagnosis or thresholds. */
export const spectralDescriptions: Record<string, string> = {
  ndvi: 'NDVI muestra cuánta vegetación activa hay: los valores altos suelen verse más verdes y ayudan a comparar el crecimiento entre sectores de su parcela.',
  ndmi: 'NDMI orienta sobre el agua que contiene la vegetación: valores más bajos pueden señalar sectores con menos agua en las hojas que conviene revisar.',
  ndwi: 'NDWI ayuda a ubicar agua en la superficie: valores más altos pueden señalar agua visible o sectores encharcados que conviene recorrer.',
  evi: 'EVI ayuda a comparar el vigor y la cantidad de vegetación, incluso cuando el cultivo está tupido: valores más altos suelen indicar mayor actividad vegetal.',
  savi: 'SAVI muestra el desarrollo de la vegetación reduciendo el efecto del suelo descubierto, útil para comparar sectores cuando el cultivo todavía cubre poco terreno.',
  ndre: 'NDRE observa el verdor de las hojas, relacionado con la clorofila: valores más bajos pueden señalar sectores que conviene revisar, según la etapa del cultivo.',
  gndvi: 'GNDVI compara el verdor y la actividad de la vegetación: ayuda a encontrar diferencias entre sectores, sin confirmar por sí solo falta de nutrientes.',
  nbr: 'NBR ayuda a comparar cambios en la cobertura vegetal entre fechas: una caída puede orientar hacia zonas con pérdida de vegetación que conviene revisar.',
  msi: 'MSI orienta sobre la falta de agua en la vegetación: valores más altos pueden indicar hojas con menos agua y ayudan a ubicar sectores para revisar.',
  recl: 'ReCl orienta sobre la clorofila, el pigmento verde de las hojas: valores más altos suelen indicar más clorofila y permiten comparar sectores de su cultivo.',
}

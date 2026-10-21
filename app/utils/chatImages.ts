/** Prepare camera photos for the existing 8 MB/file, 16 MB/turn API limits. */
export async function prepareChatImages(files: File[]): Promise<File[]> {
  if (files.length > 4) throw new Error('Adjunte hasta 4 fotografías por mensaje.')
  const prepared: File[] = []
  for (const file of files) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      throw new Error('Use fotografías JPG, PNG o WebP.')
    let result = file
    if (file.size > 2 * 1024 * 1024) {
      const url = URL.createObjectURL(file)
      try {
        const image = new Image()
        image.src = url
        await image.decode()
        const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
        const context = canvas.getContext('2d')
        if (!context) throw new Error('No se pudo preparar la fotografía. Pruebe con una imagen más pequeña.')
        context.fillStyle = '#fff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .85))
        if (!blob) throw new Error('No se pudo preparar la fotografía. Intente exportarla como JPG.')
        result = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {type:'image/jpeg'})
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('No se pudo preparar')) throw error
        throw new Error('No se pudo abrir la fotografía. Intente con otro archivo JPG, PNG o WebP.')
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    if (result.size > 8 * 1024 * 1024) throw new Error('La fotografía supera 8 MB incluso después de optimizarla. Elija una más pequeña.')
    prepared.push(result)
  }
  if (prepared.reduce((total, file) => total + file.size, 0) > 16 * 1024 * 1024)
    throw new Error('Las fotografías juntas superan 16 MB. Envíelas en mensajes separados.')
  return prepared
}

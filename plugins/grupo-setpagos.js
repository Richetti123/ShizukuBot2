let handler = async (m, { conn, text, command }) => {
  let field = command.replace(/^set/, '').toLowerCase()
  let validFields = ['pagos', 'stock', 'reglas']
  if (!validFields.includes(field)) throw '╰⊱❌⊱ *ERROR* ⊱❌⊱╮\n\n❌ COMANDO INVÁLIDO.'

  let chat = global.db.data.chats[m.chat] ||= {}
  chat[field] ||= {}

  let userId = m.sender.split('@')[0] // número del usuario sin @s.whatsapp.net

  const q = m.quoted ? m.quoted : m
  const mime = (q.msg || q).mimetype || ''

  if (mime && mime.startsWith('image')) {
    let buffer = await q.download()
    if (!buffer) throw '╰⊱❌⊱ *ERROR* ⊱❌⊱╮\n\n❌ No se pudo descargar la imagen.'

    let base64 = buffer.toString('base64')
    chat[field][userId] = { type: 'image', content: base64 }

    return conn.reply(m.chat, `╰⊱💚⊱ ÉXITO ⊱💚⊱╮\n\n╰⊱✅⊱ *CONFIGURACIÓN GUARDADA* ⊱✅⊱╮\n\n✅ Imagen de ${field.toUpperCase()} guardada para *@${userId}*.`, false, {mentions: [m.sender]}, m)
  }

  if (text?.trim()) {
    chat[field][userId] = { type: 'text', content: text.trim() }
    return conn.reply(m.chat, `╰⊱💚⊱ ÉXITO ⊱💚⊱╮\n\n╰⊱✅⊱ *CONFIGURACIÓN GUARDADA* ⊱✅⊱╮\n\n✅ Texto de ${field.toUpperCase()} guardado para *@${userId}*.`, false, {mentions: [m.sender]}, m)
  }

  throw `╰⊱❕⊱ *INFORMACIÓN* ⊱❕⊱╮\n\n Envía un texto o responde a una imagen para configurar *${field.toUpperCase()}*.`
}

handler.command = /^set(pagos|stock|reglas)$/i
handler.admin = true
handler.group = true

export default handler

import fs from 'fs/promises'
import path from 'path'

const CONFIG_FILE = path.resolve('./src/configuraciones.json')
const confirmDeletes = {} // Para confirmación de borrado

// Normaliza nombre para que 'general', 'grupo', 'grupal' sean equivalentes
function normalizeName(name) {
  if (!name) return 'general'
  const n = name.toLowerCase()
  if (['general', 'grupo', 'grupal'].includes(n)) return 'general'
  return n
}

async function readConfigTypes() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

async function addConfigType(type) {
  const types = await readConfigTypes()
  if (!types.includes(type)) {
    types.push(type)
    await fs.writeFile(CONFIG_FILE, JSON.stringify(types, null, 2), 'utf-8')
  }
}

let handler = async (m, { conn, usedPrefix, command, args }) => {
  let chat = global.db.data.chats[m.chat] ||= {}
  chat.configs ||= {}

  const typeRaw = args[0]?.toLowerCase()
  let nameRaw = args[1] || ''
  const type = typeRaw
  const name = normalizeName(nameRaw)

  // -- SET CONFIG --
  if (command.match(/^(setcfg|setconfig|s|set)$/i)) {
    if (!type) throw `╰⊱❗️⊱ *USO INCORRECTO* ⊱❗️⊱╮\n\nEjemplo:\n${usedPrefix}${command} pagos general texto a guardar`

    const rest = args.slice(2)
    const value = rest.join(' ').trim()

    chat.configs[type] ||= {}

    const q = m.quoted ? m.quoted : m
    const mime = (q.msg || q).mimetype || ''

    if (mime.startsWith('image')) {
      let buffer = await q.download()
      if (!buffer) throw '╰⊱❌⊱ *ERROR* ⊱❌⊱╮\n\n❌ No se pudo descargar la imagen.'
      let base64 = buffer.toString('base64')
      chat.configs[type][name] = { type: 'image', content: base64, author: m.sender }
      await addConfigType(type)
      return conn.reply(m.chat, `╰⊱💚⊱ *ÉXITO* ⊱💚⊱╮\n\n✅ *Imagen de ${type.toUpperCase()} (${name}) configurada correctamente.*`, m)
    }

    if (value) {
      chat.configs[type][name] = { type: 'text', content: value, author: m.sender }
      await addConfigType(type)
      return conn.reply(m.chat, `╰⊱💚⊱ *ÉXITO* ⊱💚⊱╮\n\n✅ *Texto de ${type.toUpperCase()} (${name}) configurado correctamente.*`, m)
    }

    throw `⊱❗️⊱ *ACCIÓN MAL USADA* ⊱❗️⊱╮\n\n❌ Envía un texto o responde a una imagen para configurar ${type.toUpperCase()} con el nombre "${name}".`
  }

  // -- VER CONFIG --
  if (command.match(/^(vercfg|verconfig|v)$/i)) {
    const allowedCommands = await readConfigTypes()
    if (!type) return m.reply(`╰⊱❗️⊱ *USO INCORRECTO* ⊱❗️⊱╮\n\nUsa:\n${usedPrefix}${command} <tipo> [nombre]\n\nEjemplo:\n${usedPrefix}${command} pagos\n${usedPrefix}${command} pagos general`)

    if (!allowedCommands.includes(type)) return m.reply(`╰⊱❌⊱ *NO CONFIGURADO* ⊱❌⊱╮\n\nEl apartado "${type}" no está configurado.`)

    let configsOfType = chat.configs[type]
    if (!configsOfType) return m.reply(`╰⊱📭⊱ *VACÍO* ⊱📭⊱╮\n\nNo hay configuraciones para *${type.toUpperCase()}*.`)

    if (!nameRaw) {
      let keys = Object.keys(configsOfType)
      if (!keys.length) return m.reply(`╰⊱📭⊱ *VACÍO* ⊱📭⊱╮\n\nNo hay configuraciones para *${type.toUpperCase()}*.`)
      return m.reply(`╰⊱📌⊱ *DISPONIBLES* ⊱📌⊱╮\n\nConfiguraciones para *${type.toUpperCase()}*:\n${keys.map(k => `◦ ${k}`).join('\n')}`)
    }

    let entry = configsOfType[name]
    if (!entry || !entry.content) {
      return m.reply(`╰⊱❌⊱ *NO CONFIGURADO* ⊱❌⊱╮\n\nNo se encontró configuración para *${type.toUpperCase()} (${name})*.`)
    }

    if (entry.type === 'image') {
      try {
        let buffer = Buffer.from(entry.content, 'base64')
        await conn.sendFile(m.chat, buffer, `${type}-${name}.jpg`, `AQUÍ TIENES LOS *${type.toUpperCase()} DE ${name}*`, m)
      } catch {
        return m.reply(`╰⊱❌⊱ *ERROR* ⊱❌⊱╮\n\nError al enviar la imagen configurada para *${type.toUpperCase()} (${name})*.`)
      }
    } else if (entry.type === 'text') {
      return m.reply(entry.content)
    }
  }

  // -- BORRAR CONFIG --
  if (command.match(/^(delcfg|delconfig|deletecfg|deleteconfig)$/i)) {
    if (!type) return m.reply(`╰⊱❗️⊱ *USO INCORRECTO* ⊱❗️⊱╮\n\nUsa:\n${usedPrefix}${command} <tipo> [nombre]\n\nEjemplo:\n${usedPrefix}${command} pagos general`)
    if (!chat.configs[type]?.[name]) return m.reply(`╰⊱❌⊱ *NO CONFIGURADO* ⊱❌⊱╮\n\nNo hay configuración para *${type.toUpperCase()} (${name})* para borrar.`)

    // Si no es general, verifica autor
    if (name !== 'general' && chat.configs[type][name].author !== m.sender) {
      return m.reply(`╰⊱❌⊱ *PERMISO DENEGADO* ⊱❌⊱╮\n\nSolo quien configuró *${type.toUpperCase()} (${name})* puede borrarlo.`)
    }

    // Confirmación de borrado
    if (!confirmDeletes[m.sender]) {
      confirmDeletes[m.sender] = { type, name }
      return conn.reply(m.chat, `⚠️ *CONFIRMA EL BORRADO* ⚠️\n\n¿Quieres borrar la configuración *${type.toUpperCase()} (${name})*?\n\nUsa de nuevo el comando para confirmar.`, m)
    }

    if (confirmDeletes[m.sender].type !== type || confirmDeletes[m.sender].name !== name) {
      confirmDeletes[m.sender] = { type, name }
      return conn.reply(m.chat, `⚠️ *CONFIRMACIÓN CAMBIADA* ⚠️\n\n¿Quieres borrar la configuración *${type.toUpperCase()} (${name})*?\n\nUsa de nuevo el comando para confirmar.`, m)
    }

    // Borra configuración y limpia objetos vacíos
    delete chat.configs[type][name]
    if (Object.keys(chat.configs[type]).length === 0) delete chat.configs[type]

    // Si no hay más configs de ese tipo en el chat, borrar del archivo JSON
    let types = await readConfigTypes()
    if (types.includes(type)) {
      types = types.filter(t => t !== type)
      await fs.writeFile(CONFIG_FILE, JSON.stringify(types, null, 2), 'utf-8')
    }

    delete confirmDeletes[m.sender]

    return conn.reply(m.chat, `✅ *Configuración ${type.toUpperCase()} (${name}) eliminada correctamente.*`, m)
  }

  // -- LISTAR CONFIGURACIONES --
  if (command.match(/^(listcfg|listconfig|listacfg|listaconfig)$/i)) {
    const allConfigs = chat.configs
    let response = '╰⊱📋⊱ *CONFIGURACIONES EN ESTE GRUPO* ⊱📋⊱╮\n\n'
    let count = 0

    for (let type in allConfigs) {
      for (let name in allConfigs[type]) {
        response += `.vercfg ${type} ${name}\n`
        count++
      }
    }

    if (count === 0) {
      return m.reply(`╰⊱📭⊱ *VACÍO* ⊱📭⊱╮\n\nNo hay configuraciones guardadas.`)
    }

    return m.reply(response)
  }
}

handler.command = [
  /^setcfg$/i, /^setconfig$/i, /^set$/i,
  /^vercfg$/i, /^verconfig$/i, /^v$/i,
  /^delcfg$/i, /^delconfig$/i, /^deletecfg$/i, /^deleteconfig$/i,
  /^listcfg$/i, /^listconfig$/i, /^listacfg$/i, /^listaconfig$/i
]
handler.group = true
handler.admin = true

export default handler

# Serveur statique local avec no-store (évite les pages blanches après F5 à cause du cache)
# - HTTP  : port 8471 (LAN) — raccourci « écran d'accueil » plein écran
# - HTTPS : port 8472 (cert.pem/key.pem auto-générés si absents) — active le service worker
#           → vrai fonctionnement hors-ligne sur iPhone. Pour faire confiance au certificat
#             sur l'iPhone : ouvrir https://<IP_LAN>:8472/cert.pem et installer le profil.
require 'webrick'
require 'webrick/https' # indispensable pour que SSLEnable soit pris en compte
require 'openssl'

# Le contexte SSL par défaut de WEBrick est mal réglé sur ce macOS (rejette même TLS 1.2) :
# on force min TLS 1.2 après construction du contexte.
module GH_SSLFix
  def setup_ssl_context(config)
    ctx = super
    begin
      ctx.min_version = OpenSSL::SSL::TLS1_2_VERSION
    rescue StandardError
      ctx.options |= OpenSSL::SSL::OP_NO_SSLv2 | OpenSSL::SSL::OP_NO_SSLv3 | OpenSSL::SSL::OP_NO_TLSv1 | OpenSSL::SSL::OP_NO_TLSv1_1
    end
    ctx
  end
end
WEBrick::GenericServer.prepend(GH_SSLFix)

ROOT = File.expand_path(__dir__)

MIME = {
  '.html' => 'text/html; charset=utf-8', '.js' => 'application/javascript; charset=utf-8',
  '.css' => 'text/css; charset=utf-8', '.json' => 'application/json',
  '.webmanifest' => 'application/manifest+json', '.png' => 'image/png', '.svg' => 'image/svg+xml',
  '.mp3' => 'audio/mpeg', '.ogg' => 'audio/ogg', '.wav' => 'audio/wav', '.m4a' => 'audio/mp4',
  '.md' => 'text/markdown; charset=utf-8', '.pem' => 'application/x-x509-ca-cert',
}.freeze

handler = proc do |req, res|
  rel = req.path == '/' ? 'index.html' : req.path
  path = File.join(ROOT, rel)
  path = File.join(path, 'index.html') if File.directory?(path)
  if File.file?(path) && path.start_with?(ROOT)
    res['Content-Type'] = MIME[File.extname(path)] || 'application/octet-stream'
    res['Cache-Control'] = 'no-store'
    res.body = File.binread(path)
  else
    res.status = 404
    res['Content-Type'] = 'text/plain'
    res.body = '404'
  end
end

opts = {
  DocumentRoot: ROOT,
  Logger: WEBrick::Log.new('/tmp/gh-server.log'),
  AccessLog: [[File.open('/tmp/gh-access.log', 'a'), '%m %p %s']],
}

srv = WEBrick::HTTPServer.new({ Port: 8471 }.merge(opts))
srv.mount_proc('/', &handler)

# HTTPS optionnel : certificat auto-signé généré une fois pour toutes (localhost + IP LAN)
cert = File.join(ROOT, 'cert.pem')
key = File.join(ROOT, 'key.pem')
if !File.exist?(cert) || !File.exist?(key)
  system('openssl req -x509 -newkey rsa:2048 -keyout "' + key + '" -out "' + cert +
    '" -days 825 -nodes -subj "/CN=GH-Local" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.168.1.70" >/dev/null 2>&1')
end
if File.exist?(cert) && File.exist?(key)
  ssl = WEBrick::HTTPServer.new({
    Port: 8472,
    SSLEnable: true,
    SSLCertificate: OpenSSL::X509::Certificate.new(File.read(cert)),
    SSLPrivateKey: OpenSSL::PKey::RSA.new(File.read(key)),
  }.merge(opts))
  ssl.mount_proc('/', &handler)
  Thread.new { ssl.start }
  puts "HTTPS : https://localhost:8472/  (certificat auto-signé — ouvrir /cert.pem sur l'iPhone pour l'installer)"
end

puts 'HTTP  : http://localhost:8471/'
trap('INT') { srv.shutdown }
trap('TERM') { srv.shutdown }
srv.start

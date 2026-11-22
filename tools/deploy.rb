#!/usr/bin/env ruby
# frozen_string_literal: true
# Déploie le dossier GH/ sur github.com/studioacil/GH via l'API REST GitHub
# (aucun binaire git requis sur le Mac). GitHub Pages redéploie automatiquement.
#
# Usage :
#   GH_TOKEN=ghp_xxxxxxxx ./tools/deploy.rb          # token en variable d'env (recommandé)
#   ./tools/deploy.rb ghp_xxxxxxxx                    # ou en argument
#
# Créer le token : github.com → Settings → Developer settings → Personal access tokens
# → Tokens (classic) → Generate new token (classic) → coche "repo" → Generate → copie.
# Le token ne quitte jamais ta machine avec ce script (révoque-le quand tu veux sur GitHub).
require 'net/http'
require 'json'
require 'base64'

TOKEN = (ENV['GH_TOKEN'] || ARGV[0] || '').strip
REPO = 'studioacil/GH'
ROOT = File.expand_path('..', __dir__)
EXCLUDE = [/^\.git/, /cert\.pem$/, /key\.pem$/, /\.log$/, /\.DS_Store$/].freeze

if TOKEN.empty?
  puts 'Token manquant.'
  puts '  1) github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)'
  puts '     → Generate new token (classic) → coche "repo" → Generate → copie le token (affiché une seule fois)'
  puts '  2) GH_TOKEN=ghp_xxxx ./tools/deploy.rb'
  exit 1
end

def api(method, path, body = nil)
  uri = URI("https://api.github.com/repos/#{REPO}#{path}")
  req = Net::HTTP.const_get(method.to_s.capitalize).new(uri)
  req['Authorization'] = "Bearer #{TOKEN}"
  req['Accept'] = 'application/vnd.github+json'
  req['X-GitHub-Api-Version'] = '2022-11-28'
  req['User-Agent'] = 'gh-deploy-script'
  if body
    req['Content-Type'] = 'application/json'
    req.body = JSON.generate(body)
  end
  res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(req) }
  data = res.body.to_s.empty? ? {} : JSON.parse(res.body)
  unless res.code.to_i.between?(200, 299)
    puts "ERREUR #{res.code} #{method} #{path} : #{data['message']}"
    exit 2
  end
  data
end

# 1) branche par défaut + commit courant
repo = api(:get, '')
branch = repo['default_branch'] || 'main'
ref = api(:get, "/git/ref/heads/#{branch}")
head = ref['object']['sha']
base_tree = api(:get, "/git/commits/#{head}")['tree']['sha']
puts "Branche #{branch} @ #{head[0, 7]}"

# 2) liste des fichiers à pousser (secrets exclus)
files = Dir.chdir(ROOT) { Dir.glob('**/*', File::FNM_DOTMATCH).select { |f| File.file?(f) && EXCLUDE.none? { |r| r.match?(f) } } }
puts "#{files.length} fichiers à pousser…"

# 3) un blob par fichier (base64), puis un arbre, un commit, et on pousse la ref
tree = files.map do |f|
  content = File.binread(File.join(ROOT, f))
  blob = api(:post, '/git/blobs', { content: Base64.strict_encode64(content), encoding: 'base64' })
  print '.'
  { path: f, mode: '100644', type: 'blob', sha: blob['sha'] }
end
puts
new_tree = api(:post, '/git/trees', { base_tree: base_tree, tree: tree })['sha']
commit = api(:post, '/git/commits', {
  message: "Deploy GH — #{Time.now.strftime('%Y-%m-%d %H:%M')} (tools/deploy.rb)",
  tree: new_tree, parents: [head],
})
api(:patch, "/git/refs/heads/#{branch}", { sha: commit['sha'], force: false })
puts "✅ Poussé : #{commit['sha'][0, 7]} sur #{branch}"
puts "🌐 Pages : https://studioacil.github.io/GH/  (redéployé dans ~1 min)"

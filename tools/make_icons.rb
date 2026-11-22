# frozen_string_literal: true
# Génère les icônes PNG de la PWA (aucun gem requis, zlib stdlib uniquement).
# Design : fond sombre arrondi, couronne "60 min" aux 5 couleurs de zones
# (0° = midi, sens horaire : diamant → étoile → verte → rouge → noire),
# bille blanche lumineuse en haut, lettres GH au centre.
# Usage : ruby tools/make_icons.rb
require 'zlib'

ROOT = File.expand_path('..', __dir__)
ICONS = File.join(ROOT, 'icons')
Dir.mkdir(ICONS) unless Dir.exist?(ICONS)

# ---------- mini moteur de rendu (supersampling 4x) ----------
class Canvas
  def initialize(size, ss = 4)
    @ss = ss
    @w = size * ss
    @h = size * ss
    @px = Array.new(@h) { Array.new(@w) { [0, 0, 0, 0] } } # r,g,b,a (0-255, a 0-255)
  end

  def blend(x, y, color, alpha)
    return if x < 0 || y < 0 || x >= @w || y >= @h || alpha <= 0
    r, g, b = color
    a = alpha
    d = @px[y][x]
    na = a + d[3] * (255 - a) / 255.0
    return if na <= 0
    d[0] = (r * a + d[0] * d[3] * (255 - a) / 255.0) / na
    d[1] = (g * a + d[1] * d[3] * (255 - a) / 255.0) / na
    d[2] = (b * a + d[2] * d[3] * (255 - a) / 255.0) / na
    d[3] = na
  end

  # disque plein
  def disc(cx, cy, radius, color, alpha = 255)
    r2 = radius * radius
    (cy - radius).ceil.upto((cy + radius).floor) do |y|
      (cx - radius).ceil.upto((cx + radius).floor) do |x|
        dx = x - cx; dy = y - cy
        blend(x, y, color, alpha) if dx * dx + dy * dy <= r2
      end
    end
  end

  # disque dégradé (glow) : alpha décroissant vers l'extérieur
  def glow(cx, cy, radius, color, peak_alpha)
    (cy - radius).ceil.upto((cy + radius).floor) do |y|
      (cx - radius).ceil.upto((cx + radius).floor) do |x|
        dx = x - cx; dy = y - cy
        d = Math.sqrt(dx * dx + dy * dy)
        next if d > radius
        t = d / radius
        blend(x, y, color, (peak_alpha * (1 - t) * (1 - t)).round)
      end
    end
  end

  # rectangle arrondi rempli
  def round_rect(x0, y0, x1, y1, radius, color, alpha = 255)
    (y0).ceil.upto((y1).floor) do |y|
      (x0).ceil.upto((x1).floor) do |x|
        # distance au rect arrondi
        cx = [[x, x0 + radius].max, x1 - radius].min
        cy = [[y, y0 + radius].max, y1 - radius].min
        dx = x - cx; dy = y - cy
        blend(x, y, color, alpha) if dx * dx + dy * dy <= radius * radius || (x0 + radius..x1 - radius).cover?(x) || (y0 + radius..y1 - radius).cover?(y)
      end
    end
  end

  # arc de couronne (anneau) entre deux angles, 0° = haut, sens horaire
  def ring_arc(cx, cy, r_out, r_in, a0, a1, color, alpha = 255)
    # balayage en polaire
    steps = ((a1 - a0).abs * r_out * 0.15).ceil + 8
    prev = nil
    (0..steps).each do |i|
      a = (a0 + (a1 - a0) * i / steps) * Math::PI / 180
      # pas radial : on remplit le petit secteur par balayage de rayons
      r = r_in
      while r <= r_out
        x = cx + r * Math.sin(a)
        y = cy - r * Math.cos(a)
        blend(x.round, y.round, color, alpha)
        r += 0.5
      end
    end
  end

  # texte avec police 5x7
  FONT = {
    'G' => ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
    'H' => ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  }.freeze

  def text(str, cx, cy, h, color, alpha = 255)
    scale = h / 7.0
    w = str.length * 6 * scale - scale
    x0 = cx - w / 2
    y0 = cy - h / 2
    str.each_char.with_index do |ch, ci|
      glyph = FONT[ch] or next
      glyph.each_with_index do |row, ry|
        row.each_char.with_index do |c, rx|
          next unless c == '#'
          (0...(scale.ceil)).each do |dy|
            (0...(scale.ceil)).each do |dx|
              blend((x0 + ci * 6 * scale + rx * scale + dx).round, (y0 + ry * scale + dy).round, color, alpha)
            end
          end
        end
      end
    end
  end

  def write_png(path, logical_size)
    ss = @ss
    w = logical_size
    h = logical_size
    rows = []
    (0...h).each do |y|
      row = +''.b
      (0...w).each do |x|
        r = g = b = a = 0
        (0...ss).each do |sy|
          (0...ss).each do |sx|
            p = @px[y * ss + sy][x * ss + sx]
            r += p[0]; g += p[1]; b += p[2]; a += p[3]
          end
        end
        n = ss * ss
        row << [(r / n).round, (g / n).round, (b / n).round, (a / n).round].pack('C4')
      end
      rows << "\x00".b + row
    end
    raw = rows.join.b
    ihdr = [w, h, 8, 6, 0, 0, 0].pack('NNCCCCC')
    chunk = lambda do |type, data|
      ([data.bytesize].pack('N') + type.b + data + [Zlib.crc32(type.b + data)].pack('N')).b
    end
    File.binwrite(path, ("\x89PNG\r\n\x1a\n".b + chunk.call('IHDR', ihdr) + chunk.call('IDAT', Zlib::Deflate.deflate(raw, 9)) + chunk.call('IEND', '')))
    puts "OK #{path}"
  end
end

# ---------- dessin de l'icône ----------
ZONES = [ # [angle_deg_debut, couleur] — 0° = midi, sens horaire, 360° = 60 min
  [0,   [90, 200, 250]],   # diamant  #5ac8fa  (0–12 min)
  [72,  [255, 214, 10]],   # étoile   #ffd60a  (12–24)
  [144, [48, 209, 88]],    # verte     #30d158  (24–36)
  [216, [255, 69, 58]],    # rouge     #ff453a  (36–48)
  [288, [90, 90, 96]],     # noire     #3a3a3e  (48–60)
].freeze
BG = [11, 11, 16].freeze

def draw_icon(size, scale_content = 1.0)
  c = Canvas.new(size, 4)
  s = size.to_f
  c.round_rect(0, 0, s * 4 - 1, s * 4 - 1, s * 0.225 * 4, BG) # fond (en coords supersamplées: tout est *4 via Canvas)
  # NOTE : Canvas travaille en pixels supersamplés ; on passe tout en *4
  cx = s * 2; cy = s * 2
  r_out = s * 0.36 * scale_content * 4 / 4 * 4 # simplifié ci-dessous
  # dessin direct en coordonnées supersamplées (×4)
  cx = s / 2 * 4; cy = s / 2 * 4
  r_out = s * 0.36 * scale_content * 4
  r_in = s * 0.275 * scale_content * 4
  ZONES.each_with_index do |(a0, col), i|
    a1 = ZONES[i + 1] ? ZONES[i + 1][0] : 360
    c.ring_arc(cx, cy, r_out, r_in, a0, a1, col)
  end
  # bille blanche en haut (0°) + glow
  bx = cx; by = cy - (r_out + r_in) / 2
  c.glow(bx, by, s * 0.10 * 4, [255, 255, 255], 160)
  c.disc(bx, by, s * 0.042 * 4, [255, 255, 255])
  # lettres GH au centre
  c.text('GH', cx, cy + s * 0.01 * 4, s * 0.15 * scale_content * 4, [245, 245, 250])
  c
end

draw_icon(192).write_png(File.join(ICONS, 'icon-192.png'), 192)
draw_icon(512).write_png(File.join(ICONS, 'icon-512.png'), 512)
draw_icon(512, 0.78).write_png(File.join(ICONS, 'icon-512-maskable.png'), 512) # zone sûre maskable
draw_icon(180).write_png(File.join(ICONS, 'apple-touch-icon.png'), 180)

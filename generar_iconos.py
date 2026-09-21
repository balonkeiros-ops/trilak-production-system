from PIL import Image
import os

LOGO_PATH = 'public/logotrilak.png'
BRAND_COLOR = (22, 77, 99, 255)
PADDING_RATIO = 0.08

def generar_icono(size, output_path):
    if not os.path.exists(LOGO_PATH):
        print('No se encuentra ' + LOGO_PATH)
        return
    logo = Image.open(LOGO_PATH).convert('RGBA')
    canvas = Image.new('RGBA', (size, size), BRAND_COLOR)
    area_util = int(size * (1 - 2 * PADDING_RATIO))
    lw, lh = logo.size
    ratio = min(area_util / lw, area_util / lh)
    nuevo_w = int(lw * ratio)
    nuevo_h = int(lh * ratio)
    logo_escalado = logo.resize((nuevo_w, nuevo_h), Image.LANCZOS)
    x = (size - nuevo_w) // 2
    y = (size - nuevo_h) // 2
    canvas.paste(logo_escalado, (x, y), logo_escalado)
    canvas.save(output_path, 'PNG', optimize=True)
    print('OK -> ' + output_path + '  (' + str(size) + 'x' + str(size) + ')')

if __name__ == '__main__':
    generar_icono(192, 'public/logo192.png')
    generar_icono(512, 'public/logo512.png')
    print('Listo')

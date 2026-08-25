from pathlib import Path
from PIL import Image

source_dir = Path('/home/ubuntu/upload')
target_dir = Path('/home/ubuntu/servicevch/public/vehicle-artwork')
target_dir.mkdir(parents=True, exist_ok=True)

files = {
    'pasted_file_vC7qZp_image.png': 'mercedes-vito.webp',
    'pasted_file_rUaqku_image.png': 'mercedes-eqe.webp',
    'pasted_file_a5592q_image.png': 'mercedes-eclass.webp',
}

for source_name, target_name in files.items():
    image = Image.open(source_dir / source_name).convert('RGB')
    image.thumbnail((900, 900), Image.Resampling.LANCZOS)
    image.save(target_dir / target_name, 'WEBP', quality=84, method=6)
    print(target_dir / target_name)

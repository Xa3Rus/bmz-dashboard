# -*- coding: utf-8 -*-
"""
Скрипт Blender (bpy) для работы с 3D-моделью дуговой печи ДСП-135 (ОАО «БМЗ»).
Позволяет в один клик:
1. Импортировать эталонную 3D-модель `../renderer/models/dsp135.glb` в Blender с сохранением всей иерархии узлов АСУ ТП:
   - `Furnace_Tilt_Group` (наклонная платформа люльки)
   - `Shell_Full` / `Shell_Cut` (полный кожух и разрез кожуха с футеровкой)
   - `Bath_Group` (`Liquid_Bath`, `Liquid_Bath_Body`, `Slag_Ring`, `Scrap_Group`)
   - `Roof_Swing_Pivot` -> `Roof_Assembly` (поворотный свод, дельта и газоотвод)
   - `Gantry_Base` (портал и колонны мачт)
   - `Electrode_Group` (`Phase_1..3`, `Electrode_1..3`, `Arc_1..3`, `Arc_Halo_1..3`)
   - `Shop_Environment` (фундамент, рабочая площадка, трансформаторная 120 МВА, сталевоз с ковшом, шлаковня)
2. Сохранить нативный файл проекта `dsp135.blend`.
3. Экспортировать изменения обратно в `../renderer/models/dsp135.glb` с флагом `export_extras=True` (сохраняя пользовательские свойства `matKey` и `hasCadEdges` для движка приложения).

Использование:
- В интерфейсе Blender: вкладка Scripting -> Open -> выбрать этот файл -> Run Script.
- Или из командной строки:
  blender --background --python blender/dsp135_blender_project.py
"""

import os
import bpy

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(THIS_DIR, ".."))
GLB_PATH = os.path.join(PROJECT_ROOT, "renderer", "models", "dsp135.glb")
BLEND_PATH = os.path.join(THIS_DIR, "dsp135.blend")


def import_dsp135_glb():
    """Очищает стартовую сцену Blender и импортирует эталонную модель dsp135.glb."""
    bpy.ops.wm.read_factory_settings(use_empty=True)

    if not os.path.exists(GLB_PATH):
        raise FileNotFoundError(f"Файл модели не найден: {GLB_PATH}")

    bpy.ops.import_scene.gltf(filepath=GLB_PATH)

    # Настраиваем отображение во вьюпорте Blender
    for scene in bpy.data.scenes:
        scene.unit_settings.system = 'METRIC'
        scene.unit_settings.scale_length = 1.0

    print(f"[BMZ DSP-135] Модель успешно импортирована из: {GLB_PATH}")


def export_dsp135_glb():
    """Экспортирует сцену из Blender обратно в renderer/models/dsp135.glb с сохранением Custom Properties (extras)."""
    os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=GLB_PATH,
        export_format='GLB',
        export_extras=True,
        export_yup=True,
        export_apply=False
    )
    print(f"[BMZ DSP-135] Модель экспортирована в приложение: {GLB_PATH}")


if __name__ == "__main__":
    import_dsp135_glb()
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    print(f"[BMZ DSP-135] Проект Blender сохранён: {BLEND_PATH}")

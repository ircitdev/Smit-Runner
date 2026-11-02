// Модель робота + выбранные анимации → один GLB для игры: public/models/robot.glb.
// Исходники Tripo (модель с ригом Mixamo и анимации) в репозиторий не кладутся — 11 МБ.
//   cd tools && npm i @gltf-transform/core@4.1.1 @gltf-transform/extensions@4.1.1 @gltf-transform/functions@4.1.1 meshoptimizer@0.22.0 sharp@0.33.5
//   node pack-robot.mjs <папка с robot_humanoid_rigged.glb и animations/>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress, meshopt, resample } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const SRC = process.argv[2] || '.';
const doc = await io.read(`${SRC}/robot_humanoid_rigged.glb`);
const root = doc.getRoot();
const byName = new Map(root.listNodes().map(n => [n.getName(), n]));
const buffer = root.listBuffers()[0];
const CLIPS = { run: 'preset_biped_run', jump: 'preset_biped_jump', hit: 'preset_biped_fall',
  defeat: 'preset_biped_defeat_02', idle: 'preset_biped_idle', greet: 'preset_biped_greet_02', dance: 'preset_biped_dance_05', pose: 'preset_biped_fold_arms' };
for (const [name, file] of Object.entries(CLIPS)) {
  const src = (await io.read(`${SRC}/animations/${file}.glb`)).getRoot().listAnimations()[0];
  const anim = doc.createAnimation(name);
  for (const ch of src.listChannels()) {
    const node = byName.get(ch.getTargetNode().getName());
    if (!node) continue;
    const s = ch.getSampler();
    const acc = a => doc.createAccessor().setType(a.getType()).setArray(a.getArray().slice()).setBuffer(buffer);
    const out = acc(s.getOutput());
    if (node.getName() === 'mixamorig:Hips' && ch.getTargetPath() === 'translation') {
      // бег на месте: корень не уезжает по горизонтали (в клипе бега Hips проходит 3 м по X)
      const a = out.getArray(), [bx, , bz] = node.getTranslation();
      for (let i = 0; i < a.length; i += 3) { a[i] = bx; a[i + 2] = bz; }
    }
    const sampler = doc.createAnimationSampler().setInput(acc(s.getInput())).setOutput(out)
      .setInterpolation(s.getInterpolation());
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node)
      .setTargetPath(ch.getTargetPath()).setSampler(sampler));
  }
}
// модель Tripo смотрит вдоль +X; игра ждёт +Z (Player.tsx разворачивает на 180° к трассе)
byName.get('Armature').setRotation([0, -Math.SQRT1_2, 0, Math.SQRT1_2]);
await doc.transform(
  resample(), dedup(), prune(),
  // цвет и рельеф — 2048 (видно на заставке крупным планом), металл/шероховатость — 1024
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(baseColor|normal)/, resize: [2048, 2048], quality: 90 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^metallicRoughness/, resize: [1024, 1024], quality: 88 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 16, quantizeNormal: 12, quantizeTexcoord: 14 }),
);
await io.write(new URL('../public/models/robot.glb', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), doc);
console.log('anims', doc.getRoot().listAnimations().map(a => a.getName()).join(','));

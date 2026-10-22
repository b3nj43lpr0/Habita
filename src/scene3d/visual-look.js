import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function createVisualLook(renderer,scene,camera){
  const pmrem=new THREE.PMREMGenerator(renderer),environment=new RoomEnvironment();
  scene.environment=pmrem.fromScene(environment,.06).texture;scene.environmentIntensity=.3;environment.dispose();pmrem.dispose();
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4});
  const composer=new EffectComposer(renderer,target);composer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  const beauty=new RenderPass(scene,camera),contact=new SSAOPass(scene,camera,1,1,12);
  contact.kernelRadius=.5;contact.minDistance=.00015;contact.maxDistance=.012;
  const glow=new UnrealBloomPass(new THREE.Vector2(1,1),.15,.65,2.2);
  composer.addPass(beauty);composer.addPass(contact);composer.addPass(glow);composer.addPass(new OutputPass());
  return {
    resize(width,height){composer.setSize(width,height);},
    night(value){glow.strength=value?.28:.15;scene.environmentIntensity=value?.16:.3;},
    render(camera,mode){
      if(mode==='2d'){renderer.render(scene,camera);return;}
      beauty.camera=camera;contact.camera=camera;
      const uniforms=contact.ssaoMaterial.uniforms;
      uniforms.cameraNear.value=camera.near;uniforms.cameraFar.value=camera.far;
      uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);uniforms.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
      composer.render();
    }
  };
}

import { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";

const COLORS = {
  paper: "#F3F0F7",
  surface: "#FFFFFF",
  ink: "#201B2C",
  inkSoft: "#5B5468",
  hematoxylin: "#3B2E5A",
  eosin: "#C6577B",
  teal: "#2F6B63",
  amber: "#B8843B",
  line: "#E1DCE9",
};

const LAYER_COLORS = {
  skin: "#D9A98C",
  muscle: "#B5453F",
  skeletal: "#EDE6D6",
  nerve: "#E8D24C",
  vascular: "#C23B3B",
};

const LAYERS = [
  { id: "skin", label: "Skin" },
  { id: "muscle", label: "Muscle" },
  { id: "skeletal", label: "Skeletal" },
  { id: "nerve", label: "Nerve" },
  { id: "vascular", label: "Vascular" },
];

function part(name, layer, geo, position, opts = {}) {
  return {
    name,
    layer,
    geo,
    position,
    rotation: opts.rotation || [0, 0, 0],
    geoScale: opts.geoScale,
    relatedLibrary: opts.relatedLibrary,
    relatedQuiz: opts.relatedQuiz,
    relatedThread: opts.relatedThread,
  };
}

const REGIONS = {
  brain: {
    label: "Brain",
    code: "ANA 305",
    camera: [0, 0, 4.2],
    parts: [
      part("Scalp", "skin", { type: "sphere", args: [1.05, 24, 24] }, [0, 0.25, 0]),
      part("Skull", "skeletal", { type: "sphere", args: [0.97, 24, 24] }, [0, 0.25, 0], {
        relatedLibrary: { title: "Cranial Osteology Handout" },
      }),
      part("Cerebrum", "nerve", { type: "sphere", args: [0.85, 24, 24] }, [0, 0.32, 0], {
        relatedLibrary: { title: "Neuroanatomy Lecture Series — Week 1" },
        relatedQuiz: { title: "Cranial Nerves Rapid Fire", code: "ANA 305" },
      }),
      part("Cerebellum", "nerve", { type: "sphere", args: [0.36, 20, 20] }, [0, -0.18, -0.72]),
      part("Brainstem", "nerve", { type: "cylinder", args: [0.14, 0.18, 0.65, 16] }, [0, -0.55, -0.28], {
        rotation: [0.35, 0, 0],
        relatedQuiz: { title: "Brainstem Nuclei Challenge", code: "ANA 405" },
        relatedThread: { title: "Why does this brainstem slide show asymmetric staining?" },
      }),
      part("Circle of Willis", "vascular", { type: "torus", args: [0.5, 0.045, 10, 24] }, [0, 0.02, 0.28], {
        rotation: [Math.PI / 2, 0, 0],
      }),
    ],
  },
  spinalCord: {
    label: "Spinal Cord",
    code: "ANA 210",
    camera: [0, 0, 6.5],
    parts: [
      part("Vertebral column", "skeletal", { type: "cylinder", args: [0.32, 0.32, 4, 20] }, [0, 0, 0], {
        relatedLibrary: { title: "Vertebral Column Osteology Notes" },
      }),
      part("Dura mater", "skin", { type: "cylinder", args: [0.36, 0.36, 4, 20] }, [0, 0, 0]),
      part("Spinal cord", "nerve", { type: "cylinder", args: [0.09, 0.09, 3.85, 16] }, [0, 0, 0], {
        relatedQuiz: { title: "Autonomic Pathways Practice Set", code: "ANA 305" },
      }),
      part("Spinal nerve roots", "nerve", { type: "cylinder", args: [0.035, 0.035, 0.7, 8] }, [0.32, 0.4, 0], {
        rotation: [0, 0, -Math.PI / 3],
      }),
      part("Vertebral artery", "vascular", { type: "cylinder", args: [0.04, 0.04, 3.9, 10] }, [0.4, 0, 0.05], {
        relatedThread: { title: "Vertebral artery variation — case discussion" },
      }),
    ],
  },
  upperLimb: {
    label: "Upper Limb",
    code: "ANA 201",
    camera: [0, 0, 5.5],
    parts: [
      part("Skin", "skin", { type: "cylinder", args: [0.34, 0.28, 3.6, 16] }, [0, 0.1, 0]),
      part("Shoulder joint", "skeletal", { type: "sphere", args: [0.24, 18, 18] }, [0, 1.55, 0]),
      part("Humerus", "skeletal", { type: "cylinder", args: [0.12, 0.14, 1.3, 14] }, [0, 0.9, 0], {
        relatedLibrary: { title: "Upper Limb Osteology Notes" },
      }),
      part("Elbow joint", "skeletal", { type: "sphere", args: [0.16, 18, 18] }, [0, 0.2, 0]),
      part("Forearm bones", "skeletal", { type: "cylinder", args: [0.1, 0.11, 1.3, 14] }, [0, -0.55, 0], {
        relatedQuiz: { title: "Upper Limb Osteology Sprint", code: "ANA 201" },
      }),
      part("Deltoid", "muscle", { type: "sphere", args: [0.3, 16, 16] }, [0.08, 1.32, 0.08]),
      part("Biceps brachii", "muscle", { type: "cylinder", args: [0.17, 0.15, 1.05, 14] }, [0.16, 0.9, 0.1], {
        relatedThread: { title: "300-level cranial nerve OSCE prep group" },
      }),
      part("Median nerve", "nerve", { type: "cylinder", args: [0.03, 0.03, 1.2, 8] }, [0.2, 0.55, 0.12]),
      part("Brachial artery", "vascular", { type: "cylinder", args: [0.035, 0.035, 1.2, 8] }, [-0.14, 0.55, 0.12]),
    ],
  },
  lowerLimb: {
    label: "Lower Limb",
    code: "ANA 220",
    camera: [0, 0, 6],
    parts: [
      part("Skin", "skin", { type: "cylinder", args: [0.4, 0.32, 4, 16] }, [0, 0, 0]),
      part("Hip joint", "skeletal", { type: "sphere", args: [0.28, 18, 18] }, [0, 1.7, 0]),
      part("Femur", "skeletal", { type: "cylinder", args: [0.15, 0.17, 1.55, 14] }, [0, 0.9, 0], {
        relatedLibrary: { title: "Lower Limb Osteology Reference" },
      }),
      part("Knee joint", "skeletal", { type: "sphere", args: [0.18, 18, 18] }, [0, 0.05, 0]),
      part("Tibia & fibula", "skeletal", { type: "cylinder", args: [0.12, 0.13, 1.5, 14] }, [0, -0.75, 0]),
      part("Quadriceps", "muscle", { type: "cylinder", args: [0.22, 0.19, 1.3, 14] }, [0.1, 0.9, 0.12], {
        relatedQuiz: { title: "Pelvic Floor Quick Check", code: "ANA 309" },
      }),
      part("Femoral artery", "vascular", { type: "cylinder", args: [0.04, 0.04, 1.4, 8] }, [-0.16, 0.9, 0.12], {
        relatedThread: { title: "Femoral triangle boundaries — quick check" },
      }),
      part("Sciatic nerve", "nerve", { type: "cylinder", args: [0.045, 0.045, 1.6, 8] }, [0.06, 0.6, -0.15]),
    ],
  },
  thorax: {
    label: "Thorax",
    code: "RAD 301",
    camera: [0, 0, 6.5],
    parts: [
      part("Skin", "skin", { type: "sphere", args: [1.5, 24, 20] }, [0, 0, 0], { rotation: [0, 0, 0] }),
      part("Thoracic vertebrae", "skeletal", { type: "cylinder", args: [0.16, 0.16, 2.6, 12] }, [0, 0, -0.9]),
      part("Ribcage", "skeletal", { type: "torus", args: [1.1, 0.06, 8, 24, Math.PI * 1.5] }, [0, 0.1, 0], {
        rotation: [Math.PI / 2, 0, Math.PI / 4],
        relatedLibrary: { title: "Thoracic Wall Landmarks Handout" },
      }),
      part("Sternum", "skeletal", { type: "cylinder", args: [0.12, 0.12, 1.1, 10] }, [0, 0.2, 1], {
        rotation: [Math.PI / 2, 0, 0],
      }),
      part("Right lung", "nerve", { type: "sphere", args: [0.55, 18, 18] }, [0.55, 0.1, 0.1], {
        geoScale: [0.7, 1.3, 1],
        relatedQuiz: { title: "Chest X-Ray Landmarks", code: "RAD 301" },
      }),
      part("Left lung", "nerve", { type: "sphere", args: [0.55, 18, 18] }, [-0.55, 0.1, 0.1], { geoScale: [0.7, 1.3, 1] }),
      part("Aorta", "vascular", { type: "torus", args: [0.35, 0.05, 8, 20, Math.PI] }, [0, 0.6, -0.2], {
        rotation: [0, Math.PI / 2, 0],
        relatedThread: { title: "How to differentiate pneumothorax vs effusion" },
      }),
    ],
  },
  abdomen: {
    label: "Abdomen",
    code: "PHY 310",
    camera: [0, 0, 6],
    parts: [
      part("Skin", "skin", { type: "sphere", args: [1.35, 22, 20] }, [0, 0, 0]),
      part("Lumbar vertebrae", "skeletal", { type: "cylinder", args: [0.15, 0.15, 2.2, 12] }, [0, 0, -0.85]),
      part("Liver", "muscle", { type: "sphere", args: [0.55, 18, 18] }, [0.5, 0.5, 0.15], {
        geoScale: [1.1, 0.7, 0.9],
        relatedLibrary: { title: "Abdominal Viscera Overview Notes" },
      }),
      part("Stomach", "muscle", { type: "sphere", args: [0.4, 16, 16] }, [-0.3, 0.4, 0.2], {
        geoScale: [1, 0.8, 0.8],
      }),
      part("Kidneys", "muscle", { type: "sphere", args: [0.28, 14, 14] }, [0.55, -0.1, -0.4], {
        geoScale: [0.7, 1, 0.6],
        relatedQuiz: { title: "Renal Filtration Basics", code: "PHY 310" },
      }),
      part("Abdominal aorta", "vascular", { type: "cylinder", args: [0.07, 0.07, 2, 10] }, [0, 0, -0.7], {
        relatedThread: { title: "Renin-angiotensin-aldosterone — reference range questions" },
      }),
    ],
  },
  pelvis: {
    label: "Pelvis",
    code: "ANA 309",
    camera: [0, 0, 5],
    parts: [
      part("Skin", "skin", { type: "torus", args: [0.95, 0.55, 16, 24] }, [0, 0, 0], { rotation: [Math.PI / 2, 0, 0] }),
      part("Pelvic girdle", "skeletal", { type: "torus", args: [0.85, 0.22, 14, 24] }, [0, 0, 0], {
        rotation: [Math.PI / 2, 0, 0],
        relatedLibrary: { title: "Pelvic Bone Landmarks Handout" },
      }),
      part("Sacrum", "skeletal", { type: "cylinder", args: [0.22, 0.16, 0.7, 12] }, [0, 0.3, -0.6]),
      part("Hip sockets", "skeletal", { type: "sphere", args: [0.2, 16, 16] }, [0.75, -0.1, 0.1]),
      part("Pelvic floor muscles", "muscle", { type: "cylinder", args: [0.7, 0.7, 0.12, 20] }, [0, -0.35, 0], {
        relatedQuiz: { title: "Pelvic Floor Quick Check", code: "ANA 309" },
      }),
      part("Internal iliac vessels", "vascular", { type: "cylinder", args: [0.04, 0.04, 0.9, 8] }, [0.5, 0.15, 0], {
        rotation: [0, 0, Math.PI / 4],
        relatedThread: { title: "Discuss the boundaries and contents of the femoral triangle" },
      }),
    ],
  },
  perineum: {
    label: "Perineum",
    code: "ANA 309",
    camera: [0, 0, 3.5],
    parts: [
      part("Skin", "skin", { type: "sphere", args: [0.55, 18, 16] }, [0, 0, 0], { geoScale: [1.2, 0.4, 1.2] }),
      part("Perineal membrane", "muscle", { type: "cylinder", args: [0.42, 0.42, 0.08, 20] }, [0, -0.05, 0], {
        relatedLibrary: { title: "Pelvic Floor Muscles Reference" },
      }),
      part("Pudendal nerve", "nerve", { type: "cylinder", args: [0.025, 0.025, 0.6, 8] }, [0.3, 0, 0.1], {
        rotation: [0, 0, Math.PI / 3],
      }),
      part("Internal pudendal vessels", "vascular", { type: "cylinder", args: [0.03, 0.03, 0.55, 8] }, [-0.28, 0, 0.1], {
        rotation: [0, 0, -Math.PI / 3],
        relatedThread: { title: "Pelvic floor anatomy — case discussion" },
      }),
    ],
  },
};

const REGION_ORDER = ["brain", "spinalCord", "upperLimb", "lowerLimb", "thorax", "abdomen", "pelvis", "perineum"];

function buildGeometry(spec) {
  if (spec.type === "sphere") return new THREE.SphereGeometry(...spec.args);
  if (spec.type === "cylinder") return new THREE.CylinderGeometry(...spec.args);
  if (spec.type === "torus") return new THREE.TorusGeometry(...spec.args);
  return new THREE.SphereGeometry(0.3, 12, 12);
}

export default function ModelViewer() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const groupRef = useRef(null);
  const meshMapRef = useRef({});
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0 });
  const rotationRef = useRef({ x: 0.15, y: 0.5 });
  const zoomRef = useRef(1);
  const cameraDistRef = useRef(REGIONS.brain.camera[2]);

  const [activeRegion, setActiveRegion] = useState("brain");
  const [activeLayers, setActiveLayers] = useState({ skin: true, muscle: false, skeletal: true, nerve: false, vascular: false });
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const region = REGIONS[activeRegion];

  // ---- one-time scene setup ----
  useEffect(() => {
    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = null;
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0, region.camera[2]);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";
    rendererRef.current = renderer;

    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambient);
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.9);
    dir1.position.set(3, 4, 5);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.35);
    dir2.position.set(-4, -2, -3);
    scene.add(dir2);

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    let raf;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (!dragRef.current.dragging) {
        rotationRef.current.y += 0.0022;
      }
      group.rotation.y = rotationRef.current.y;
      group.rotation.x = rotationRef.current.x;
      camera.position.z = cameraDistRef.current / zoomRef.current;
      renderer.render(scene, camera);
    };
    animate();

    const onPointerDown = (e) => {
      dragRef.current.dragging = true;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
    };
    const onPointerMove = (e) => {
      if (!dragRef.current.dragging) return;
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      rotationRef.current.y += dx * 0.006;
      rotationRef.current.x = Math.max(-1.1, Math.min(1.1, rotationRef.current.x + dy * 0.006));
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
    };
    const onPointerUp = () => { dragRef.current.dragging = false; };
    const onWheel = (e) => {
      e.preventDefault();
      zoomRef.current = Math.max(0.5, Math.min(3, zoomRef.current - e.deltaY * 0.001));
    };

    const dom = renderer.domElement;
    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    dom.addEventListener("wheel", onWheel, { passive: false });

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      resizeObserver.disconnect();
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- rebuild meshes when region or layer visibility changes ----
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    while (group.children.length) {
      const c = group.children.pop();
      c.geometry.dispose();
      c.material.dispose();
    }
    meshMapRef.current = {};

    region.parts.forEach((p) => {
      if (!activeLayers[p.layer]) return;
      const geometry = buildGeometry(p.geo);
      const isSkin = p.layer === "skin";
      const material = new THREE.MeshStandardMaterial({
        color: LAYER_COLORS[p.layer],
        transparent: isSkin,
        opacity: isSkin ? 0.32 : 1,
        roughness: 0.55,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...p.position);
      mesh.rotation.set(...p.rotation);
      if (p.geoScale) mesh.scale.set(...p.geoScale);
      group.add(mesh);
      meshMapRef.current[p.name] = { mesh, material, baseColor: LAYER_COLORS[p.layer], baseOpacity: isSkin ? 0.32 : 1 };
    });

    rotationRef.current.y = 0.5;
    rotationRef.current.x = 0.15;
    zoomRef.current = 1;
    cameraDistRef.current = region.camera[2];
    if (cameraRef.current) cameraRef.current.position.z = region.camera[2];

    setSelected(null);
    setSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRegion, activeLayers]);

  // ---- highlight selected structure ----
  useEffect(() => {
    Object.entries(meshMapRef.current).forEach(([name, m]) => {
      const isSel = name === selected;
      m.material.color.set(isSel ? COLORS.eosin : m.baseColor);
      m.material.emissive = new THREE.Color(isSel ? COLORS.eosin : 0x000000);
      m.material.emissiveIntensity = isSel ? 0.25 : 0;
      m.material.opacity = isSel ? 1 : m.baseOpacity;
    });
  }, [selected]);

  const toggleLayer = (id) => setActiveLayers((prev) => ({ ...prev, [id]: !prev[id] }));

  const filteredStructures = useMemo(() => {
    return region.parts.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  }, [region, search]);

  const selectedPart = region.parts.find((p) => p.name === selected);

  return (
    <div
      className="w-full h-screen flex flex-col overflow-hidden"
      style={{ background: COLORS.paper, fontFamily: "'IBM Plex Sans', sans-serif", color: COLORS.ink }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
      `}</style>

      {/* header */}
      <div
        className="flex items-center justify-between px-5 py-3 flex-none"
        style={{ borderBottom: `1px solid ${COLORS.line}`, background: "rgba(243,240,247,0.92)" }}
      >
        <div className="flex items-center gap-3">
          <button
            className="md:hidden flex flex-col gap-1 p-1"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="Toggle regions"
          >
            <span style={{ width: 18, height: 2, background: COLORS.ink }} />
            <span style={{ width: 18, height: 2, background: COLORS.ink }} />
            <span style={{ width: 18, height: 2, background: COLORS.ink }} />
          </button>
          <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 17 }}>LearnAnatomy</span>
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10.5,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "3px 9px",
              borderRadius: 999,
              background: COLORS.hematoxylin,
              color: "#fff",
            }}
          >
            3D Models
          </span>
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: COLORS.inkSoft }}>
          {region.label} · {region.code}
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* region switcher */}
        <div
          className={`${mobileNavOpen ? "flex" : "hidden"} md:flex flex-col flex-none w-full md:w-56 overflow-y-auto absolute md:relative z-20 md:z-auto`}
          style={{ background: COLORS.surface, borderRight: `1px solid ${COLORS.line}`, height: mobileNavOpen ? "auto" : undefined, maxHeight: "100%" }}
        >
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10.5,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: COLORS.inkSoft,
              padding: "16px 18px 8px",
            }}
          >
            Regions
          </div>
          {REGION_ORDER.map((key) => {
            const r = REGIONS[key];
            const active = key === activeRegion;
            return (
              <button
                key={key}
                onClick={() => { setActiveRegion(key); setMobileNavOpen(false); }}
                className="text-left text-sm"
                style={{
                  padding: "12px 18px",
                  fontWeight: active ? 500 : 400,
                  color: active ? COLORS.ink : COLORS.inkSoft,
                  background: active ? COLORS.paper : "transparent",
                  borderLeft: active ? `3px solid ${COLORS.hematoxylin}` : "3px solid transparent",
                }}
              >
                {r.label}
              </button>
            );
          })}

          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10.5,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: COLORS.inkSoft,
              padding: "20px 18px 10px",
              borderTop: `1px solid ${COLORS.line}`,
              marginTop: 8,
            }}
          >
            Layers
          </div>
          <div className="flex flex-wrap gap-2 pb-5" style={{ paddingLeft: 18, paddingRight: 18 }}>
            {LAYERS.map((l) => {
              const active = activeLayers[l.id];
              return (
                <button
                  key={l.id}
                  onClick={() => toggleLayer(l.id)}
                  className="flex items-center gap-2 text-xs px-3 py-2 rounded-full"
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    border: `1px solid ${active ? COLORS.ink : COLORS.line}`,
                    background: active ? COLORS.ink : COLORS.surface,
                    color: active ? "#fff" : COLORS.inkSoft,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: LAYER_COLORS[l.id],
                      display: "inline-block",
                      border: active ? "1px solid rgba(255,255,255,0.6)" : "none",
                    }}
                  />
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* canvas */}
        <div className="flex-1 relative min-w-0">
          <div ref={mountRef} className="w-full h-full" style={{ cursor: "grab" }} />
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center"
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10.5,
              color: COLORS.inkSoft,
              background: "rgba(255,255,255,0.75)",
              padding: "6px 14px",
              borderRadius: 999,
              border: `1px solid ${COLORS.line}`,
            }}
          >
            Drag to rotate · Scroll to zoom
          </div>
        </div>

        {/* structure list + cross-links */}
        <div
          className="hidden lg:flex flex-col w-72 flex-none overflow-y-auto"
          style={{ background: COLORS.surface, borderLeft: `1px solid ${COLORS.line}` }}
        >
          <div style={{ padding: "16px 18px 10px" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search structures…"
              className="w-full text-sm"
              style={{
                fontFamily: "'IBM Plex Sans', sans-serif",
                padding: "9px 12px",
                borderRadius: 6,
                border: `1px solid ${COLORS.line}`,
                background: COLORS.paper,
                color: COLORS.ink,
              }}
            />
          </div>

          <div style={{ padding: "0 18px" }}>
            {filteredStructures.map((p) => {
              const active = p.name === selected;
              const disabled = !activeLayers[p.layer];
              return (
                <button
                  key={p.name}
                  onClick={() => !disabled && setSelected(active ? null : p.name)}
                  className="w-full text-left flex items-center gap-2 py-2.5 text-sm"
                  style={{
                    borderBottom: `1px solid ${COLORS.line}`,
                    color: disabled ? "#B7B0C2" : active ? COLORS.ink : COLORS.inkSoft,
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 999,
                      background: LAYER_COLORS[p.layer],
                      flex: "none",
                      opacity: disabled ? 0.35 : 1,
                    }}
                  />
                  {p.name}
                  {disabled && (
                    <span style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5 }}>
                      layer off
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {selectedPart && (
            <div style={{ padding: "18px", borderTop: `1px solid ${COLORS.line}`, marginTop: 8 }}>
              <div
                style={{
                  fontFamily: "'Fraunces', serif",
                  fontWeight: 500,
                  fontSize: 15.5,
                  marginBottom: 4,
                }}
              >
                {selectedPart.name}
              </div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: COLORS.inkSoft,
                  marginBottom: 16,
                }}
              >
                {LAYERS.find((l) => l.id === selectedPart.layer)?.label} layer
              </div>

              {selectedPart.relatedLibrary && (
                <CrossLinkCard
                  label="Related in Library"
                  title={selectedPart.relatedLibrary.title}
                  color={COLORS.hematoxylin}
                />
              )}
              {selectedPart.relatedQuiz && (
                <CrossLinkCard
                  label="Related quiz"
                  title={`${selectedPart.relatedQuiz.title} · ${selectedPart.relatedQuiz.code}`}
                  color={COLORS.amber}
                />
              )}
              {selectedPart.relatedThread && (
                <CrossLinkCard
                  label="Discussed in Threads"
                  title={selectedPart.relatedThread.title}
                  color={COLORS.eosin}
                />
              )}
              {!selectedPart.relatedLibrary && !selectedPart.relatedQuiz && !selectedPart.relatedThread && (
                <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>No related content linked yet.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CrossLinkCard({ label, title, color }) {
  return (
    <button
      className="w-full text-left mb-2 p-3 rounded-lg"
      style={{ border: `1px solid ${COLORS.line}`, background: COLORS.paper }}
    >
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 9.5,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.4, color: COLORS.ink }}>{title}</div>
    </button>
  );
}

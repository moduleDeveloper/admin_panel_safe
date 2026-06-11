import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Sidebar from '../components/Sidebar';
import {
  fetchGalleryFolders,
  fetchGalleryPhotos,
  fetchGalleryPhotosByFolder,
  fetchGalleryPhotosCount,
  createGalleryFolder,
  createGalleryPhoto,
  deleteGalleryPhoto,
  deleteGalleryFolder,
  updateGalleryFolder,
} from '../services/galleryService';
import { getAllowedImageFormatsMessage, isImageFileLike } from '../utils/imageUpload';
import './GalleryPage.css';

export default function GalleryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { folderId: routeFolderId = '' } = useParams();
  const { userName = 'Admin', trust = null } = location.state || {};
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'home-page';
  const trustId = trust?.id || null;

  const [folders, setFolders] = useState([]);
  const [folderCardPhotos, setFolderCardPhotos] = useState([]);
  const [selectedFolderPhotos, setSelectedFolderPhotos] = useState([]);
  const [totalPhotoCount, setTotalPhotoCount] = useState(0);
  const [selectedPhotoTotal, setSelectedPhotoTotal] = useState(0);
  const [selectedPhotoFetching, setSelectedPhotoFetching] = useState(false);
  const [selectedPhotoInitialLoading, setSelectedPhotoInitialLoading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isEditingFolder, setIsEditingFolder] = useState(false);
  const [activeFolderMenuId, setActiveFolderMenuId] = useState(null);
  const [folderSearch, setFolderSearch] = useState('');
  const [folderSort, setFolderSort] = useState('name_asc');
  const [folderPage, setFolderPage] = useState(1);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const deferredFolderSearch = useDeferredValue(folderSearch);
  const currentMemberId = location.state?.selectedMemberId || null;
  const FOLDER_PAGE_SIZE = 6;
  const PHOTO_BATCH_SIZE = 20;
  const MAX_UPLOAD_COUNT = 15;
  const MAX_IMAGE_SIZE_BYTES = 25 * 1024;

  useEffect(() => {
    if (!trustId) navigate('/dashboard', { replace: true, state: { userName, trust } });
  }, [trustId, userName, navigate, trust]);

  useEffect(() => {
    const load = async () => {
      if (!trustId) return;
      setLoading(true);
      setError('');
      setNotice('');
      const { data: folderData, error: folderErr } = await fetchGalleryFolders(trustId);
      if (folderErr) setError(folderErr.message || 'Unable to load folders.');

      const trustFolders = folderData || [];
      setFolders(trustFolders);
      const folderIds = trustFolders.map((f) => f.id).filter(Boolean);
      const { count: totalCount, error: photoCountErr } = await fetchGalleryPhotosCount(folderIds);
      if (photoCountErr) setError(photoCountErr.message || 'Unable to load photo count.');
      setTotalPhotoCount(totalCount || 0);
      const hasRouteFolder = trustFolders.some((folder) => String(folder.id) === String(routeFolderId));
      if (hasRouteFolder) {
        setSelectedFolderId(routeFolderId);
      } else {
        setSelectedFolderId((prev) => {
          if (prev && trustFolders.some((folder) => String(folder.id) === String(prev))) return prev;
          return trustFolders[0]?.id || '';
        });
      }
      setLoading(false);
    };
    load();
  }, [trustId, routeFolderId]);

  useEffect(() => {
    if (routeFolderId) {
      setSelectedFolderId(routeFolderId);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [routeFolderId]);

  const folderNameById = useMemo(() => {
    const map = new Map();
    folders.forEach((f) => map.set(f.id, f.name));
    return map;
  }, [folders]);

  const photoCountByFolderId = useMemo(() => {
    const map = new Map();
    folderCardPhotos.forEach((photo) => {
      const key = photo.folderId;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [folderCardPhotos]);

  const coverPhotoByFolderId = useMemo(() => {
    const map = new Map();
    folderCardPhotos.forEach((photo) => {
      if (!map.has(photo.folderId)) {
        map.set(photo.folderId, photo.url);
      }
    });
    return map;
  }, [folderCardPhotos]);
  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) || null,
    [folders, selectedFolderId]
  );

  const showFolderDetail = Boolean(routeFolderId && selectedFolder);

  const handleHeaderBack = () => {
    if (routeFolderId) {
      navigate('/gallery', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
      return;
    }
    navigate('/dashboard', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
  };

  const filteredFolders = useMemo(() => {
    const term = deferredFolderSearch.trim().toLowerCase();
    let list = folders;
    if (term) {
      list = list.filter((folder) => String(folder.name || '').toLowerCase().includes(term));
    }
    const sorted = [...list].sort((left, right) =>
      String(left.name || '').localeCompare(String(right.name || ''))
    );
    if (folderSort === 'name_desc') sorted.reverse();
    return sorted;
  }, [folders, deferredFolderSearch, folderSort]);

  const folderTotalPages = Math.max(1, Math.ceil(filteredFolders.length / FOLDER_PAGE_SIZE));
  const folderStartIndex = filteredFolders.length === 0 ? 0 : (folderPage - 1) * FOLDER_PAGE_SIZE + 1;
  const folderEndIndex = Math.min(folderPage * FOLDER_PAGE_SIZE, filteredFolders.length);

  const paginatedFolders = useMemo(() => {
    const start = (folderPage - 1) * FOLDER_PAGE_SIZE;
    return filteredFolders.slice(start, start + FOLDER_PAGE_SIZE);
  }, [filteredFolders, folderPage]);

  const folderPaginationItems = useMemo(() => {
    if (folderTotalPages <= 1) return [];
    if (folderTotalPages <= 7) {
      return Array.from({ length: folderTotalPages }, (_, i) => i + 1);
    }

    if (folderPage <= 4) {
      return [1, 2, 3, 4, 5, 'ellipsis-right', folderTotalPages];
    }

    if (folderPage >= folderTotalPages - 3) {
      return [
        1,
        'ellipsis-left',
        folderTotalPages - 4,
        folderTotalPages - 3,
        folderTotalPages - 2,
        folderTotalPages - 1,
        folderTotalPages,
      ];
    }

    return [1, 'ellipsis-left', folderPage - 1, folderPage, folderPage + 1, 'ellipsis-right', folderTotalPages];
  }, [folderPage, folderTotalPages]);

  useEffect(() => {
    setFolderPage(1);
  }, [folderSearch, folderSort]);

  useEffect(() => {
    if (folderPage > folderTotalPages) setFolderPage(folderTotalPages);
  }, [folderPage, folderTotalPages]);

  useEffect(() => {
    if (!paginatedFolders.length || showFolderDetail) {
      return;
    }
    let isCancelled = false;
    const loadFolderCardPhotos = async () => {
      const folderIds = paginatedFolders.map((folder) => folder.id).filter(Boolean);
      const { data, error: photoErr } = await fetchGalleryPhotos(folderIds);
      if (isCancelled) return;
      if (photoErr) {
        setError(photoErr.message || 'Unable to load folder photos.');
        return;
      }
      setFolderCardPhotos(data || []);
    };
    loadFolderCardPhotos();
    return () => {
      isCancelled = true;
    };
  }, [paginatedFolders, showFolderDetail]);

  useEffect(() => {
    if (!showFolderDetail || !selectedFolderId) return;
    let isCancelled = false;
    setSelectedPhotoFetching(false);
    setSelectedPhotoInitialLoading(true);

    const loadSelectedFolderPhotos = async () => {
      try {
        const { data, count, error: photoErr } = await fetchGalleryPhotosByFolder(selectedFolderId, {
          offset: 0,
          limit: PHOTO_BATCH_SIZE,
        });
        if (isCancelled) return;
        if (photoErr) {
          setError(photoErr.message || 'Unable to load photos.');
          setSelectedFolderPhotos([]);
          setSelectedPhotoTotal(0);
          return;
        }
        const initialRows = data || [];
        setSelectedFolderPhotos(initialRows);
        setSelectedPhotoTotal(count || initialRows.length);
      } finally {
        if (!isCancelled) {
          setSelectedPhotoInitialLoading(false);
        }
      }
    };

    loadSelectedFolderPhotos();
    return () => {
      isCancelled = true;
    };
  }, [showFolderDetail, selectedFolderId]);

  const loadMoreSelectedFolderPhotos = async () => {
    if (!showFolderDetail || !selectedFolderId) return;
    if (selectedPhotoInitialLoading || selectedPhotoFetching) return;
    if (selectedFolderPhotos.length >= selectedPhotoTotal) return;

    setSelectedPhotoFetching(true);
    try {
      const { data, error: photoErr } = await fetchGalleryPhotosByFolder(selectedFolderId, {
        offset: selectedFolderPhotos.length,
        limit: PHOTO_BATCH_SIZE,
      });
      if (photoErr) {
        setError(photoErr.message || 'Unable to load more photos.');
        return;
      }

      const nextRows = data || [];
      if (!nextRows.length) return;

      setSelectedFolderPhotos((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        const uniqueNext = nextRows.filter((item) => !seen.has(item.id));
        return [...prev, ...uniqueNext];
      });
    } finally {
      setSelectedPhotoFetching(false);
    }
  };

  const handlePhotosScroll = (event) => {
    const node = event.currentTarget;
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (remaining <= 220) {
      loadMoreSelectedFolderPhotos();
    }
  };

  const loadImageFromFile = (file) =>
    new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Unable to process selected image.'));
      };
      image.src = objectUrl;
    });

  const canvasToBlob = (canvas, type, quality) =>
    new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    });

  const formatSizeToKb = (bytes) => Number(((Number(bytes) || 0) / 1024).toFixed(2));

  const compressImageToLimit = async (file, maxBytes) => {
    const image = await loadImageFromFile(file);
    const baseWidth = Math.max(1, image.naturalWidth || image.width || 1);
    const baseHeight = Math.max(1, image.naturalHeight || image.height || 1);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;

    let bestBlob = null;
    for (let scaleStep = 0; scaleStep < 16; scaleStep += 1) {
      const scale = Math.pow(0.75, scaleStep);
      const targetWidth = Math.max(64, Math.round(baseWidth * scale));
      const targetHeight = Math.max(64, Math.round(baseHeight * scale));
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      context.clearRect(0, 0, targetWidth, targetHeight);
      context.drawImage(image, 0, 0, targetWidth, targetHeight);

      for (let quality = 0.86; quality >= 0.06; quality -= 0.05) {
        const blob = await canvasToBlob(canvas, 'image/jpeg', Number(quality.toFixed(2)));
        if (blob && (!bestBlob || blob.size < bestBlob.size)) {
          bestBlob = blob;
        }
        if (blob && blob.size <= maxBytes) {
          const changed = blob.size < (file?.size || Infinity) || file?.type !== 'image/jpeg';
          return { file: blob, sizeValue: formatSizeToKb(blob.size), wasCompressed: changed };
        }
      }
    }

    if (bestBlob && bestBlob.size <= maxBytes) {
      const changed = bestBlob.size < (file?.size || Infinity) || file?.type !== 'image/jpeg';
      return { file: bestBlob, sizeValue: formatSizeToKb(bestBlob.size), wasCompressed: changed };
    }

    return null;
  };

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (!selectedFolderId) {
      setError('Please select a folder before uploading.');
      return;
    }

    const imageFiles = files.filter((file) => isImageFileLike(file));
    if (!imageFiles.length) {
      setError(getAllowedImageFormatsMessage());
      return;
    }

    if (imageFiles.length > MAX_UPLOAD_COUNT) {
      setError('Maximum 15 photos can be uploaded at a time.');
      return;
    }

    setUploading(true);
    setError('');
    setNotice('');

    const uploaded = [];
    let failed = 0;
    let sizeSkipped = 0;
    let compressedCount = 0;
    let firstUploadError = '';

    for (const file of imageFiles) {
      try {
        const processed = await compressImageToLimit(file, MAX_IMAGE_SIZE_BYTES);
        if (!processed?.file) {
          sizeSkipped += 1;
          continue;
        }
        if (processed.wasCompressed) {
          compressedCount += 1;
        }
        const { data, error: createErr } = await createGalleryPhoto({
          file: processed.file,
          uploadedBy: currentMemberId,
          size: processed.sizeValue,
          folderId: selectedFolderId,
        });
        if (createErr) {
          failed += 1;
          if (!firstUploadError) {
            firstUploadError = createErr.message || createErr.error_description || 'Upload failed.';
          }
        } else if (data) {
          uploaded.push(data);
        }
      } catch {
        failed += 1;
      }
    }

    if (uploaded.length > 0) {
      setSelectedFolderPhotos((prev) => [...uploaded, ...prev]);
      setSelectedPhotoTotal((prev) => prev + uploaded.length);
      setTotalPhotoCount((prev) => prev + uploaded.length);
      if (!showFolderDetail) {
        setFolderCardPhotos((prev) => [...uploaded, ...prev]);
      }
    }

    if (failed > 0 || sizeSkipped > 0 || files.length !== imageFiles.length || compressedCount > 0) {
      const notes = [];
      if (compressedCount > 0) notes.push(`${compressedCount} auto-compressed to 25KB`);
      if (failed > 0) notes.push(`${failed} failed`);
      if (sizeSkipped > 0) notes.push(`${sizeSkipped} could not be compressed to 25KB`);
      if (files.length !== imageFiles.length) notes.push(`${files.length - imageFiles.length} non-image skipped`);
      if (firstUploadError) notes.push(firstUploadError);
      const message = `Uploaded ${uploaded.length}/${imageFiles.length} image(s). ${notes.join('. ')}.`;
      const hasActualError = failed > 0 || sizeSkipped > 0 || files.length !== imageFiles.length || Boolean(firstUploadError);
      if (hasActualError) {
        setError(message);
        setNotice('');
      } else {
        setError('');
        setNotice(message);
      }
    } else {
      setError('');
      setNotice('');
    }

    setUploading(false);
  };

  const handleAddFolder = async () => {
    const name = window.prompt('Enter new folder name');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = folders.find((f) => (f.name || '').toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setSelectedFolderId(existing.id);
      navigate(`/gallery/${existing.id}`, { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
      return;
    }

    const { data, error: createErr } = await createGalleryFolder(trimmed, trustId);
    if (createErr) {
      setError(createErr.message || 'Unable to create folder.');
      return;
    }

    const newFolder = data || { id: `local-${trimmed}`, name: trimmed };
    setFolders((prev) => [newFolder, ...prev]);
    setSelectedFolderId(newFolder.id || trimmed);
    navigate(`/gallery/${newFolder.id || trimmed}`, { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
  };

  const handleDeletePhoto = async (photoId) => {
    if (!photoId) return;
    const shouldDelete = window.confirm('Are you sure you want to permanently delete this photo?');
    if (!shouldDelete) return;

    const { error: deleteErr } = await deleteGalleryPhoto(photoId);
    if (deleteErr) {
      setError(deleteErr.message || 'Unable to delete photo.');
      return;
    }

    setSelectedFolderPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
    setFolderCardPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
    setSelectedPhotoTotal((prev) => Math.max(0, prev - 1));
    setTotalPhotoCount((prev) => Math.max(0, prev - 1));
    setError('');
  };

  const handleOpenPhotoPreview = (photo) => {
    if (!photo?.url) return;
    setPreviewPhoto(photo);
  };

  const handleClosePhotoPreview = () => {
    setPreviewPhoto(null);
  };

  const handleOpenSocialMediaForm = (photo) => {
    const photoId = photo?.id;
    if (!photoId) {
      setError('Unable to open social media form right now.');
      return;
    }

    const params = new URLSearchParams({
      platform: 'instagram,facebook',
      photoId: String(photoId),
      photoUrl: photo?.url || '',
      folderId: String(photo?.folderId || selectedFolderId || ''),
      folder: folderNameById.get(photo.folderId) || folderNameById.get(selectedFolderId) || '',
    });

    navigate(`/social-media/create?${params.toString()}`, {
      state: { userName, trust, sidebarNavKey: currentSidebarNavKey },
    });
  };

  const handleDeleteFolder = async (folder) => {
    if (!folder?.id) return;

    const photoCount = folder.id === selectedFolderId ? selectedPhotoTotal : (photoCountByFolderId.get(folder.id) || 0);
    const shouldDelete = window.confirm(
      `Are you sure you want to delete the folder "${folder.name}"?\nThis folder currently contains ${photoCount} photo${photoCount === 1 ? '' : 's'}.`
    );
    if (!shouldDelete) return;

    const { error: deleteErr } = await deleteGalleryFolder(folder.id);
    if (deleteErr) {
      setError(deleteErr.message || 'Unable to delete folder.');
      return;
    }

    setFolders((prev) => prev.filter((item) => item.id !== folder.id));
    setFolderCardPhotos((prev) => prev.filter((photo) => photo.folderId !== folder.id));
    if (folder.id === selectedFolderId) {
      setSelectedFolderPhotos([]);
      setSelectedPhotoTotal(0);
    }
    setTotalPhotoCount((prev) => Math.max(0, prev - photoCount));
    setError('');

    if (selectedFolderId === folder.id || routeFolderId === folder.id) {
      navigate('/gallery', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
    }
  };

  const handleRenameFolder = async (folder) => {
    if (!folder?.id) return;

    const nextName = window.prompt('Enter a new folder name', folder.name || '');
    if (!nextName) {
      setActiveFolderMenuId(null);
      return;
    }

    const trimmed = nextName.trim();
    if (!trimmed || trimmed === folder.name) {
      setActiveFolderMenuId(null);
      return;
    }

    const duplicate = folders.find(
      (item) => item.id !== folder.id && String(item.name || '').toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      setError('A folder with this name already exists.');
      setActiveFolderMenuId(null);
      return;
    }

    const { data, error: updateErr } = await updateGalleryFolder(folder.id, { name: trimmed });
    if (updateErr) {
      setError(updateErr.message || 'Unable to rename folder.');
    } else if (data) {
      setFolders((prev) => prev.map((item) => (item.id === folder.id ? data : item)));
      setError('');
    }
    setActiveFolderMenuId(null);
  };

  const handleSelectFolder = async (folder) => {
    if (!folder?.id) return;
    setSelectedFolderId(folder.id);
    navigate(`/gallery/${folder.id}`, { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
  };

  return (
    <div className="gallery-root">
      <Sidebar
        trustName={trust?.name || 'Trust'}
        onDashboard={() => navigate('/dashboard', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } })}
        onLogout={() => navigate('/login')}
      />
      <main className="gallery-main">
        <PageHeader
          title="Gallery"
          subtitle="Upload and manage photo albums"
          onBack={handleHeaderBack}
        />
        <div className="gallery-content">
          {notice && <div className="gallery-notice">{notice}</div>}
          {error && <div className="gallery-error">{error}</div>}
          <div className="gallery-shell">
            {!routeFolderId && (
              <>
                <section className="gallery-hero">
                  <div className="gallery-hero-copy">
                    <span className="gallery-kicker">Visual archive</span>
                    <h2>Build a gallery that feels curated, not cluttered.</h2>
                    <p>
                      Organize albums, spotlight event memories, and upload fresh images into
                      beautifully grouped cards for {trust?.name || 'your trust'}.
                    </p>
                  </div>
                  <div className="gallery-hero-side">
                    <div className="gallery-stats">
                    <div className="gallery-stat-card">
                      <span className="gallery-stat-label">Albums</span>
                      <strong>{folders.length}</strong>
                    </div>
                    <div className="gallery-stat-card">
                      <span className="gallery-stat-label">Photos</span>
                      <strong>{totalPhotoCount}</strong>
                    </div>
                  </div>
                  </div>
                </section>

                <section className="gallery-folders">
                  <div className="gallery-folders-head">
                    <div>
                      <span className="gallery-section-title">Album cards</span>
                      <div className="gallery-section-sub">Only folders for the selected trust are shown here.</div>
                    </div>
                    <button className="gallery-add-folder" onClick={handleAddFolder} title="Create folder">+ New</button>
                  </div>
                  <div className="gallery-folder-controls">
                    <input
                      type="search"
                      className="gallery-folder-search"
                      placeholder="Search folder..."
                      value={folderSearch}
                      onChange={(e) => setFolderSearch(e.target.value)}
                    />
                    <label className="gallery-folder-sort">
                      <span>Sort By</span>
                      <select
                        value={folderSort}
                        onChange={(e) => setFolderSort(e.target.value)}
                      >
                        <option value="name_asc">Folder Name A-Z</option>
                        <option value="name_desc">Folder Name Z-A</option>
                      </select>
                    </label>
                  </div>
                  {folders.length === 0 ? (
                    <div className="gallery-empty">
                      No gallery folders are available for this trust. Click `+ New` to create one.
                    </div>
                  ) : filteredFolders.length === 0 ? (
                    <div className="gallery-empty">
                      No folder found for "{folderSearch}".
                    </div>
                  ) : (
                    <>
                    <div className="gallery-folder-list">
                      {paginatedFolders.map((folder, index) => (
                        <div
                          key={folder.id || folder.name}
                          className={`gallery-folder-item ${selectedFolderId === folder.id ? 'active' : ''}`}
                          style={{ ['--accent']: `var(--folder-${(((folderPage - 1) * FOLDER_PAGE_SIZE + index) % 6) + 1})` }}
                        >
                          <div className="gallery-folder-menu-wrap">
                            <button
                              type="button"
                              className="gallery-folder-menu-btn"
                              aria-label={`Edit ${folder.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveFolderMenuId((prev) => (prev === folder.id ? null : folder.id));
                              }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                <path d="M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                              </svg>
                            </button>
                            {activeFolderMenuId === folder.id && (
                              <div className="gallery-folder-menu">
                                <div className="gallery-folder-menu-row">
                                  <button
                                    type="button"
                                    className="gallery-folder-menu-item"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRenameFolder(folder);
                                    }}
                                  >
                                    Rename folder
                                  </button>
                                  <button
                                    type="button"
                                    className="gallery-folder-menu-close"
                                    aria-label="Close folder menu"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveFolderMenuId(null);
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  className="gallery-folder-menu-item delete"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteFolder(folder);
                                    setActiveFolderMenuId(null);
                                  }}
                                >
                                  Delete folder
                                </button>
                              </div>
                            )}
                          </div>
                          <button
                            className="gallery-folder-card-btn"
                            onClick={() => handleSelectFolder(folder)}
                            type="button"
                          >
                            <div className="gallery-folder-preview">
                              {coverPhotoByFolderId.get(folder.id) ? (
                                <img
                                  src={coverPhotoByFolderId.get(folder.id)}
                                  alt={folder.name}
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <div className="gallery-folder-art">
                                  <div className="gallery-folder-dot" />
                                  <div className="gallery-folder-art-line" />
                                  <div className="gallery-folder-art-line short" />
                                </div>
                              )}
                            </div>
                            <div className="gallery-folder-meta">
                              <div className="gallery-folder-name">{folder.name}</div>
                              <div className="gallery-folder-count">
                                {photoCountByFolderId.get(folder.id) || 0} photos
                              </div>
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                    {filteredFolders.length > FOLDER_PAGE_SIZE && (
                      <div className="gallery-folder-pagination">
                        <button
                          type="button"
                          onClick={() => setFolderPage((prev) => Math.max(1, prev - 1))}
                          disabled={folderPage === 1}
                        >
                          Prev
                        </button>
                        <div className="gallery-folder-pagination-pages">
                          {folderPaginationItems.map((item, index) =>
                            typeof item === 'number' ? (
                              <button
                                key={item}
                                type="button"
                                className={folderPage === item ? 'active' : ''}
                                onClick={() => setFolderPage(item)}
                                aria-current={folderPage === item ? 'page' : undefined}
                              >
                                {item}
                              </button>
                            ) : (
                              <span key={`${item}-${index}`} className="gallery-folder-pagination-ellipsis">
                                ...
                              </span>
                            )
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setFolderPage((prev) => Math.min(folderTotalPages, prev + 1))}
                          disabled={folderPage === folderTotalPages}
                        >
                          Next
                        </button>
                        <span className="gallery-folder-pagination-meta">
                          Showing {folderStartIndex}-{folderEndIndex} of {filteredFolders.length}
                        </span>
                      </div>
                    )}
                    </>
                  )}
                </section>
              </>
            )}

            {showFolderDetail && (
              <section className="gallery-board">
                <div className="gallery-detail-head">
                  <div>
                    <div className="gallery-detail-title">
                      {folderNameById.get(selectedFolderId) || 'Folder'}
                    </div>
                    <div className="gallery-detail-sub">A focused card board for this album</div>
                  </div>
                  <div className="gallery-detail-actions">
                    {isEditingFolder && selectedFolder && (
                      <>
                        <button
                          className="gallery-rename-folder"
                          onClick={() => handleRenameFolder(selectedFolder)}
                          type="button"
                        >
                          Rename Folder
                        </button>
                        <button
                          className="gallery-delete-folder"
                          onClick={() => handleDeleteFolder(selectedFolder)}
                          type="button"
                        >
                          Delete Folder
                        </button>
                      </>
                    )}
                    <button
                      className={`gallery-edit-folder ${isEditingFolder ? 'active' : ''}`}
                      onClick={() => setIsEditingFolder((prev) => !prev)}
                      type="button"
                    >
                      {isEditingFolder ? 'Done' : 'Edit Folder'}
                    </button>
                  </div>
                </div>

                <div className="gallery-detail-grid">
                  <div className="gallery-spotlight">
                    <div className="gallery-spotlight-top">
                      <span className="gallery-kicker">Selected album</span>
                      <span className="gallery-spotlight-badge">
                        {selectedPhotoTotal} photos
                      </span>
                    </div>
                    <h3>{folderNameById.get(selectedFolderId)}</h3>
                    <p>
                      Keep uploads, event coverage, and visual storytelling for this folder in one
                      clear place.
                    </p>
                    <div className="gallery-spotlight-preview">
                      {(coverPhotoByFolderId.get(selectedFolderId) || selectedFolderPhotos[0]?.url) ? (
                        <img
                          src={coverPhotoByFolderId.get(selectedFolderId) || selectedFolderPhotos[0]?.url}
                          alt={folderNameById.get(selectedFolderId)}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="gallery-spotlight-empty">
                          No cover image yet. Upload the first photo to bring this card to life.
                        </div>
                      )}
                    </div>
                  </div>

                <div className="gallery-upload">
                    <div className="gallery-upload-title">
                      <span>Add Photos</span>
                      <span className="gallery-upload-limit-badge">Max 15 per upload</span>
                    </div>
                    <label
                      className={`gallery-drop ${dragOver ? 'drag' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          handleFiles(e.target.files);
                          e.target.value = '';
                        }}
                        disabled={uploading}
                      />
                      <div className="gallery-drop-inner">
                        <span>{uploading ? 'Uploading...' : 'Drag & drop images here'}</span>
                        <span className="gallery-drop-sub">or click to upload multiple images</span>
                      </div>
                    </label>
                    <div className="gallery-upload-note">
                      Uploads go to {folderNameById.get(selectedFolderId)}. Max 15 photos at a time, 25KB each. Original ratio is preserved and images are compressed.
                    </div>
                  </div>
                </div>

                <div className="gallery-photos">
                  <div className="gallery-photos-head">
                    <div>
                      <div className="gallery-photos-title">Photo cards</div>
                      <div className="gallery-photos-sub">
                        {selectedFolderId
                          ? `Folder: ${folderNameById.get(selectedFolderId)}`
                          : 'Select a folder'}
                      </div>
                    </div>
                    <div className="gallery-photos-head-right">
                      <div className="gallery-photos-count">{selectedPhotoTotal}</div>
                    </div>
                  </div>

                  <div className="gallery-photos-scroll" onScroll={handlePhotosScroll}>
                    {(loading || selectedPhotoInitialLoading) && <div className="gallery-loading">Loading photos...</div>}

                    {!loading && !selectedPhotoInitialLoading && selectedPhotoTotal === 0 && (
                      <div className="gallery-empty">
                        No photos yet. Drop your first image to get started.
                      </div>
                    )}

                    {!loading && !selectedPhotoInitialLoading && selectedPhotoTotal > 0 && (
                      <>
                        <div className="gallery-grid">
                          {selectedFolderPhotos.map((photo, index) => (
                            <div
                              key={photo.id}
                              className="gallery-photo"
                              role="button"
                              tabIndex={0}
                              onClick={() => handleOpenPhotoPreview(photo)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  handleOpenPhotoPreview(photo);
                                }
                              }}
                            >
                              <img src={photo.url} alt="Gallery" loading="lazy" decoding="async" />
                              <div className="gallery-photo-overlay">
                                <div className="gallery-photo-top">
                                  <div className="gallery-photo-index">
                                    {String(index + 1).padStart(2, '0')}
                                  </div>
                                  <button
                                    type="button"
                                    className="gallery-photo-share gallery-photo-share-combo"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleOpenSocialMediaForm(photo);
                                    }}
                                    title="Open social media form"
                                    aria-label={`Open social media form for photo ${String(index + 1).padStart(2, '0')}`}
                                  >
                                    <span className="gallery-photo-share-icon instagram" aria-hidden="true">IG</span>
                                    <span className="gallery-photo-share-icon facebook" aria-hidden="true">f</span>
                                  </button>
                                </div>
                                {photo.folderId && (
                                  <div className="gallery-photo-tag">{folderNameById.get(photo.folderId)}</div>
                                )}
                              </div>
                              {isEditingFolder && (
                                <button
                                  type="button"
                                  className="gallery-photo-remove"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleDeletePhoto(photo.id);
                                  }}
                                >
                                  Delete photo
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        {selectedFolderPhotos.length < selectedPhotoTotal && (
                          <div className="gallery-photo-load-sentinel">
                            {selectedPhotoFetching ? (
                              <span className="gallery-photo-load-indicator">
                                <span className="gallery-photo-spinner" aria-hidden="true" />
                                Loading...
                              </span>
                            ) : (
                              'Scroll to load more images'
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>

        {previewPhoto?.url && (
          <div className="gallery-preview-backdrop" onClick={handleClosePhotoPreview}>
            <div
              className="gallery-preview-modal"
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="gallery-preview-close"
                onClick={handleClosePhotoPreview}
                aria-label="Close preview"
              >
                Close
              </button>
              <img src={previewPhoto.url} alt="Gallery preview" />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

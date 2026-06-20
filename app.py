import os
import shutil
import threading
import uuid
import json
import webbrowser
from flask import Flask, render_template, request, jsonify
import yt_dlp

app = Flask(__name__, static_folder='static', template_folder='templates')

# In-memory storage for active downloads
active_downloads = {}

# Path to downloads history file
HISTORY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'history.json')

def load_history():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_to_history(video_info):
    history = load_history()
    # Remove duplicate URL downloads to keep history clean
    history = [item for item in history if item.get('url') != video_info.get('url')]
    history.insert(0, video_info)
    # Limit to 15 items
    history = history[:15]
    try:
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(history, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving history: {e}")

def get_downloads_dir():
    # Returns standard Windows Downloads folder, with fallback to current directory
    downloads_path = os.path.join(os.path.expanduser('~'), 'Downloads')
    if os.path.exists(downloads_path):
        return downloads_path
    return os.path.dirname(os.path.abspath(__file__))

def is_ffmpeg_available():
    return shutil.which('ffmpeg') is not None

def format_size(bytes_val):
    if bytes_val is None:
        return 'Unknown'
    try:
        bytes_val = float(bytes_val)
    except ValueError:
        return 'Unknown'
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_val < 1024.0:
            return f"{bytes_val:.1f} {unit}"
        bytes_val /= 1024.0
    return f"{bytes_val:.1f} TB"

def format_speed(bytes_per_sec):
    if bytes_per_sec is None:
        return '0 B/s'
    try:
        bytes_per_sec = float(bytes_per_sec)
    except ValueError:
        return '0 B/s'
    for unit in ['B/s', 'KB/s', 'MB/s', 'GB/s']:
        if bytes_per_sec < 1024.0:
            return f"{bytes_per_sec:.1f} {unit}"
        bytes_per_sec /= 1024.0
    return f"{bytes_per_sec:.1f} TB/s"

def format_time(seconds):
    if seconds is None:
        return 'Unknown'
    try:
        seconds = int(seconds)
    except ValueError:
        return 'Unknown'
    mins, secs = divmod(seconds, 60)
    hours, mins = divmod(mins, 60)
    if hours > 0:
        return f"{hours:02d}:{mins:02d}:{secs:02d}"
    return f"{mins:02d}:{secs:02d}"

def make_progress_hook(download_id):
    def hook(d):
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            downloaded = d.get('downloaded_bytes', 0)
            percent = (downloaded / total * 100) if total > 0 else 0
            speed = d.get('speed', 0)
            eta = d.get('eta', 0)
            
            active_downloads[download_id].update({
                'status': 'downloading',
                'percent': round(percent, 1),
                'speed': format_speed(speed),
                'eta': format_time(eta),
                'downloaded_bytes': format_size(downloaded),
                'total_bytes': format_size(total)
            })
        elif d['status'] == 'finished':
            active_downloads[download_id].update({
                'status': 'processing',
                'percent': 99.0,
                'speed': '0 B/s',
                'eta': '00:00'
            })
    return hook

def download_thread(download_id, url, ydl_opts, video_title, thumbnail, duration_str, format_label):
    try:
        # Perform download
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            
            # Find the output filename
            filename = info.get('_filename')
            if not filename and 'requested_downloads' in info and len(info['requested_downloads']) > 0:
                filename = info['requested_downloads'][0].get('filepath')
            
            if not filename:
                filename = ydl.prepare_filename(info)
            
            base_name = os.path.basename(filename) if filename else "Downloaded_Video.mp4"
            
            # Update active status
            active_downloads[download_id].update({
                'status': 'completed',
                'percent': 100.0,
                'filename': base_name,
                'full_path': filename,
                'speed': '0 B/s',
                'eta': '00:00'
            })
            
            # Add to history
            save_to_history({
                'id': download_id,
                'title': video_title,
                'url': url,
                'thumbnail': thumbnail,
                'duration': duration_str,
                'format': format_label,
                'filename': base_name,
                'full_path': filename
            })
            
    except Exception as e:
        print(f"Download thread error: {e}")
        active_downloads[download_id].update({
            'status': 'error',
            'error_message': str(e)
        })

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/ffmpeg-status')
def ffmpeg_status():
    return jsonify({
        'ffmpeg_available': is_ffmpeg_available()
    })

@app.route('/api/recent')
def recent_downloads():
    return jsonify(load_history())

@app.route('/api/info', methods=['POST'])
def get_video_info():
    data = request.json or {}
    url = data.get('url')
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    
    try:
        ydl_opts = {
            'nocheckcertificate': True,
            'ignoreerrors': False,
            'logtostderr': False,
            'quiet': True,
            'no_warnings': True,
            'noplaylist': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Basic metadata extraction
            title = info.get('title', 'Unknown Title')
            thumbnail = info.get('thumbnail') or (info.get('thumbnails')[-1].get('url') if info.get('thumbnails') else None)
            duration = info.get('duration')
            duration_str = format_time(duration) if duration else 'Unknown'
            uploader = info.get('uploader', 'Unknown Channel')
            views = info.get('view_count', 0)
            likes = info.get('like_count', 0)
            
            # Filter and prepare format options based on FFmpeg availability
            ffmpeg_ok = is_ffmpeg_available()
            formats_list = []
            
            if ffmpeg_ok:
                # Add high-quality merge options
                formats_list.append({
                    'id': 'bestvideo+bestaudio/best',
                    'label': 'Best Quality Available (Merge)',
                    'ext': 'mp4',
                    'note': 'Requires merge (High Def)'
                })
                formats_list.append({
                    'id': 'bestvideo[height<=1080]+bestaudio/best',
                    'label': 'Full HD 1080p',
                    'ext': 'mp4',
                    'note': '1080p MP4'
                })
                formats_list.append({
                    'id': 'bestvideo[height<=720]+bestaudio/best',
                    'label': 'HD 720p',
                    'ext': 'mp4',
                    'note': '720p MP4'
                })
                formats_list.append({
                    'id': 'bestvideo[height<=480]+bestaudio/best',
                    'label': 'SD 480p',
                    'ext': 'mp4',
                    'note': '480p MP4'
                })
                formats_list.append({
                    'id': 'mp3',
                    'label': 'Audio Only (MP3)',
                    'ext': 'mp3',
                    'note': '192kbps MP3 Audio'
                })
                formats_list.append({
                    'id': 'bestaudio[ext=m4a]/best',
                    'label': 'Audio Only (M4A)',
                    'ext': 'm4a',
                    'note': 'AAC M4A Audio (Fast)'
                })
            else:
                # Without FFmpeg, extract progressive and audio only formats
                raw_formats = info.get('formats', [])
                progressive_added = set()
                
                # Check for standard progressive streams
                for f in raw_formats:
                    # Filter for format containing both video and audio
                    if f.get('vcodec') != 'none' and f.get('acodec') != 'none':
                        height = f.get('height')
                        ext = f.get('ext', 'mp4')
                        fid = f.get('format_id')
                        if height and ext == 'mp4' and height not in progressive_added:
                            progressive_added.add(height)
                            formats_list.append({
                                'id': fid,
                                'label': f"{height}p Progressive",
                                'ext': ext,
                                'note': f"Built-in Audio ({height}p)"
                            })
                
                # Sort progressive formats by height desc
                formats_list.sort(key=lambda x: int(x['label'].split('p')[0]) if x['label'].split('p')[0].isdigit() else 0, reverse=True)
                
                # Add default fallback formats in case progressive_added is empty or limited
                if not formats_list:
                    formats_list.append({
                        'id': 'best[ext=mp4]/best',
                        'label': 'Best Progressive (Max 720p)',
                        'ext': 'mp4',
                        'note': 'Compatible without FFmpeg'
                    })
                
                # Always add standard 360p progressive format 18
                if 360 not in progressive_added:
                    formats_list.append({
                        'id': '18',
                        'label': '360p Progressive (Standard)',
                        'ext': 'mp4',
                        'note': 'Fast Download'
                    })
                
                # Add M4A audio only (doesn't need FFmpeg)
                formats_list.append({
                    'id': 'bestaudio[ext=m4a]/best',
                    'label': 'Audio Only (M4A)',
                    'ext': 'm4a',
                    'note': 'AAC M4A Audio (No FFmpeg required)'
                })
                
            return jsonify({
                'title': title,
                'thumbnail': thumbnail,
                'duration': duration_str,
                'uploader': uploader,
                'views': f"{views:,}" if views else 'N/A',
                'likes': f"{likes:,}" if likes else 'N/A',
                'formats': formats_list,
                'ffmpeg_available': ffmpeg_ok
            })
            
    except Exception as e:
        print(f"Error fetching video info: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/download', methods=['POST'])
def start_download():
    data = request.json or {}
    url = data.get('url')
    format_id = data.get('format_id')
    video_title = data.get('title', 'Video')
    thumbnail = data.get('thumbnail', '')
    duration_str = data.get('duration', '')
    format_label = data.get('format_label', 'Standard')
    
    if not url or not format_id:
        return jsonify({'error': 'Missing URL or Format Selection'}), 400
        
    download_id = uuid.uuid4().hex
    
    downloads_dir = get_downloads_dir()
    
    # Configure download options
    ydl_opts = {
        'nocheckcertificate': True,
        'ignoreerrors': False,
        'logtostderr': False,
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'progress_hooks': [make_progress_hook(download_id)],
    }
    
    # Handle special MP3 selection
    if format_id == 'mp3':
        ydl_opts['format'] = 'bestaudio/best'
        ydl_opts['outtmpl'] = os.path.join(downloads_dir, '%(title)s.%(ext)s')
        ydl_opts['postprocessors'] = [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }]
    else:
        ydl_opts['format'] = format_id
        ydl_opts['outtmpl'] = os.path.join(downloads_dir, '%(title)s.%(ext)s')
        
    active_downloads[download_id] = {
        'id': download_id,
        'title': video_title,
        'url': url,
        'status': 'pending',
        'percent': 0.0,
        'speed': '0 B/s',
        'eta': 'Pending...',
        'downloaded_bytes': '0 B',
        'total_bytes': 'Calculating...',
        'format': format_label
    }
    
    # Launch download thread
    thread = threading.Thread(
        target=download_thread,
        args=(download_id, url, ydl_opts, video_title, thumbnail, duration_str, format_label)
    )
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'download_id': download_id,
        'message': 'Download started'
    })

@app.route('/api/progress/<download_id>')
def get_progress(download_id):
    status = active_downloads.get(download_id)
    if not status:
        return jsonify({'error': 'Download not found'}), 404
    return jsonify(status)

@app.route('/api/open-folder', methods=['POST'])
def open_folder():
    try:
        downloads_dir = get_downloads_dir()
        # Open explorer on Windows
        os.startfile(downloads_dir)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Start server and auto-open web browser
    print("Starting YouTube Downloader server...")
    webbrowser.open("http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=False)
